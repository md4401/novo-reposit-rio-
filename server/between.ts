// Dinheiro entre as pessoas da casa: quem deve a quem, combinados e a reunião do mês.
// Um acerto só aparece para as duas pessoas envolvidas; a reunião usa apenas totais da família.
import { addMonths } from "../shared/time.js";
import type { Agreement, Iou, IouPayload, MeetingAgenda } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { listBills } from "./bills.js";
import { listBudgets } from "./budgets.js";
import { num, one, query } from "./db.js";
import { familyNumbers, listGoals } from "./finance.js";
import { HttpError } from "./http.js";
import { listWishes } from "./together.js";

// ---------------------------------------------------------------------------
// Quem deve a quem

export async function listIous(user: SessionUser): Promise<IouPayload> {
  const rows = await query(
    `SELECT i.id, i.description, i.amount_cents, i.occurred_on::text AS occurred_on, i.creditor_id, i.debtor_id,
            i.settled_at, i.created_by, o.id AS other_id, o.name AS other_name
       FROM ious i
       JOIN profiles o ON o.id = CASE WHEN i.creditor_id = $1 THEN i.debtor_id ELSE i.creditor_id END
      WHERE (i.creditor_id = $1 OR i.debtor_id = $1) AND i.household_id = $2
        AND (i.settled_at IS NULL OR i.settled_at > now() - interval '60 days')
      ORDER BY (i.settled_at IS NOT NULL), i.occurred_on DESC, i.created_at DESC
      LIMIT 200`,
    [user.id, user.household_id],
  );
  const items: Iou[] = rows.map((r) => ({
    id: r.id as string,
    description: r.description as string,
    amountCents: num(r.amount_cents),
    occurredOn: r.occurred_on as string,
    owedToMe: r.creditor_id === user.id,
    otherId: r.other_id as string,
    otherName: r.other_name as string,
    settled: r.settled_at !== null,
    canDelete: r.created_by === user.id && r.settled_at === null,
  }));
  const net = new Map<string, { otherId: string; name: string; netCents: number }>();
  for (const i of items) {
    if (i.settled) continue;
    const b = net.get(i.otherId) ?? { otherId: i.otherId, name: i.otherName, netCents: 0 };
    b.netCents += i.owedToMe ? i.amountCents : -i.amountCents;
    net.set(i.otherId, b);
  }
  return { items, balances: [...net.values()].filter((b) => b.netCents !== 0) };
}

async function memberOf(user: SessionUser, otherId: string) {
  const other = await one<{ id: string }>(
    `SELECT id FROM profiles WHERE id = $1 AND household_id = $2 AND NOT is_demo`,
    [otherId, user.household_id],
  );
  if (!other || other.id === user.id) throw new HttpError(400, "Escolha outra pessoa da família");
}

export async function createIou(
  user: SessionUser,
  input: { otherId: string; owedToMe: boolean; amountCents: number; description: string; occurredOn: string },
) {
  await memberOf(user, input.otherId);
  const open = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM ious WHERE household_id = $1 AND settled_at IS NULL`,
    [user.household_id],
  );
  if ((open?.n ?? 0) >= 300) throw new HttpError(400, "Muitos acertos em aberto: acertem alguns antes");
  const [creditor, debtor] = input.owedToMe ? [user.id, input.otherId] : [input.otherId, user.id];
  await query(
    `INSERT INTO ious (household_id, creditor_id, debtor_id, amount_cents, description, occurred_on, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.household_id, creditor, debtor, input.amountCents, input.description, input.occurredOn, user.id],
  );
}

/** Marca como acertado: um item ou tudo o que está aberto com uma pessoa. */
export async function settleIous(user: SessionUser, target: { id?: string; otherId?: string }) {
  if (target.id) {
    const row = await one(
      `UPDATE ious SET settled_at = now()
        WHERE id = $1 AND (creditor_id = $2 OR debtor_id = $2) AND settled_at IS NULL RETURNING id`,
      [target.id, user.id],
    );
    if (!row) throw new HttpError(404, "Acerto não encontrado");
    return 1;
  }
  const rows = await query(
    `UPDATE ious SET settled_at = now()
      WHERE settled_at IS NULL AND household_id = $3
        AND ((creditor_id = $1 AND debtor_id = $2) OR (creditor_id = $2 AND debtor_id = $1))
      RETURNING id`,
    [user.id, target.otherId, user.household_id],
  );
  return rows.length;
}

export async function deleteIou(user: SessionUser, id: string) {
  const row = await one(`DELETE FROM ious WHERE id = $1 AND created_by = $2 AND settled_at IS NULL RETURNING id`, [id, user.id]);
  if (!row) throw new HttpError(404, "Só quem registrou pode apagar, e antes de acertar");
}

// ---------------------------------------------------------------------------
// Combinados

export async function listAgreements(user: SessionUser): Promise<Agreement[]> {
  const rows = await query(
    `SELECT a.id, a.text, a.limit_cents, a.created_by, p.name AS creator
       FROM agreements a LEFT JOIN profiles p ON p.id = a.created_by
      WHERE a.household_id = $1 ORDER BY a.created_at`,
    [user.household_id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    text: r.text as string,
    limitCents: r.limit_cents === null ? null : num(r.limit_cents),
    createdBy: (r.creator as string | null) ?? null,
    canDelete: r.created_by === user.id || user.role === "admin",
  }));
}

export async function createAgreement(user: SessionUser, text: string, limitCents: number | null) {
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM agreements WHERE household_id = $1`, [user.household_id]);
  if ((count?.n ?? 0) >= 30) throw new HttpError(400, "Limite de 30 combinados");
  await query(`INSERT INTO agreements (household_id, text, limit_cents, created_by) VALUES ($1, $2, $3, $4)`, [
    user.household_id,
    text,
    limitCents,
    user.id,
  ]);
}

export async function deleteAgreement(user: SessionUser, id: string) {
  const row = await one(
    `DELETE FROM agreements WHERE id = $1 AND household_id = $2 AND (created_by = $3 OR $4) RETURNING id`,
    [id, user.household_id, user.id, user.role === "admin"],
  );
  if (!row) throw new HttpError(404, "Combinado não encontrado");
}

// ---------------------------------------------------------------------------
// Reunião do mês: pauta pronta com totais da família (nunca compras de alguém)

export async function meetingAgenda(user: SessionUser, month: string): Promise<MeetingAgenda> {
  const [family, budgets, goals, bills, wishes, ious, agreements, meeting] = await Promise.all([
    familyNumbers(user, month, 2),
    listBudgets(user, month),
    listGoals(user),
    listBills(user, month),
    listWishes(user),
    listIous(user),
    listAgreements(user),
    one<{ notes: string; held_at: string | null }>(
      `SELECT notes, held_at FROM family_meetings WHERE household_id = $1 AND month = $2`,
      [user.household_id, month],
    ),
  ]);
  const previous = family.series.find((s) => s.month === addMonths(month, -1));
  return {
    month,
    family: {
      incomeCents: family.totals.incomeCents,
      expenseCents: family.totals.expenseCents,
      previousExpenseCents: previous?.expenseCents ?? 0,
      topCategories: family.categories.slice(0, 5).map((c) => ({ categoryId: c.categoryId, cents: c.cents })),
    },
    budgets: budgets.family.map((b) => ({ categoryId: b.categoryId, spentCents: b.spentCents, limitCents: b.limitCents })),
    goals: goals.filter((g) => g.scope === "family").map((g) => ({ name: g.name, icon: g.icon, savedCents: g.savedCents, targetCents: g.targetCents })),
    bills: bills.map((b) => ({
      name: b.name,
      amountCents: b.amountCents,
      dueOn: b.dueOn,
      unpaidCents: b.shares.filter((s) => !s.paid).reduce((s, x) => s + x.amountCents, 0),
    })),
    wishes: wishes.filter((w) => w.status === "open").slice(0, 5).map((w) => ({ name: w.name, priceCents: w.priceCents, votes: w.votes })),
    // Só os acertos de quem está olhando
    ious: ious.balances.map((b) => ({ name: b.name, netCents: b.netCents })),
    agreements,
    notes: meeting?.notes ?? "",
    heldAt: meeting?.held_at ? new Date(meeting.held_at).toISOString() : null,
  };
}

export async function saveMeeting(user: SessionUser, month: string, notes: string, held: boolean) {
  await query(
    `INSERT INTO family_meetings (household_id, month, notes, held_at, updated_by, updated_at)
     VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END, $5, now())
     ON CONFLICT (household_id, month) DO UPDATE
       SET notes = $3, held_at = CASE WHEN $4 THEN coalesce(family_meetings.held_at, now()) END, updated_by = $5, updated_at = now()`,
    [user.household_id, month, notes, held, user.id],
  );
}

// ---------------------------------------------------------------------------
// Divisão proporcional: cada pessoa informa a própria renda; a família só vê a porcentagem

export async function setSplitIncome(user: SessionUser, cents: number | null) {
  await query(`UPDATE profiles SET split_income_cents = $2 WHERE id = $1`, [user.id, cents]);
}
