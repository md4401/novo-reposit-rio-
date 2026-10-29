// Lista de desejos da família, desafios (pessoais) e mesada.
// Desejos e mesada são combinados da família de propósito; compras de cada um seguem privadas.
import { addDays, addMonths, daysInMonth, monthRange } from "../shared/time.js";
import { CHALLENGES, challengeProgress, type ChallengeKind } from "../shared/planning.js";
import type { Allowance, Challenge, Wish } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { insertTransaction } from "./finance.js";
import { HttpError } from "./http.js";

// ---------------------------------------------------------------------------
// Lista de desejos

export async function listWishes(user: SessionUser): Promise<Wish[]> {
  const rows = await query(
    `SELECT w.id, w.name, w.price_cents, w.note, w.status, w.goal_id, w.created_by, p.name AS creator,
            (SELECT count(*)::int FROM wish_votes v WHERE v.wish_id = w.id) AS votes,
            EXISTS (SELECT 1 FROM wish_votes v WHERE v.wish_id = w.id AND v.profile_id = $2) AS mine
       FROM wishes w LEFT JOIN profiles p ON p.id = w.created_by
      WHERE w.household_id = $1
      ORDER BY (w.status = 'bought'), votes DESC, w.created_at DESC`,
    [user.household_id, user.id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    priceCents: num(r.price_cents),
    note: (r.note as string | null) ?? null,
    status: r.status as Wish["status"],
    goalId: (r.goal_id as string | null) ?? null,
    votes: num(r.votes),
    votedByMe: Boolean(r.mine),
    createdBy: (r.creator as string | null) ?? null,
    canDelete: r.created_by === user.id || user.role === "admin",
  }));
}

export async function createWish(user: SessionUser, name: string, priceCents: number, note: string | null) {
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM wishes WHERE household_id = $1 AND status <> 'bought'`, [user.household_id]);
  if ((count?.n ?? 0) >= 50) throw new HttpError(400, "Limite de 50 desejos abertos");
  const row = await one<{ id: string }>(
    `INSERT INTO wishes (household_id, created_by, name, price_cents, note) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.household_id, user.id, name, priceCents, note],
  );
  await query(`INSERT INTO wish_votes (wish_id, profile_id) VALUES ($1, $2)`, [row!.id, user.id]);
}

async function wishOf(user: SessionUser, id: string) {
  const w = await one<{ id: string; name: string; price_cents: string; created_by: string | null; status: string }>(
    `SELECT id, name, price_cents, created_by, status FROM wishes WHERE id = $1 AND household_id = $2`,
    [id, user.household_id],
  );
  if (!w) throw new HttpError(404, "Desejo não encontrado");
  return w;
}

export async function toggleVote(user: SessionUser, id: string) {
  await wishOf(user, id);
  const removed = await one(`DELETE FROM wish_votes WHERE wish_id = $1 AND profile_id = $2 RETURNING wish_id`, [id, user.id]);
  if (!removed) await query(`INSERT INTO wish_votes (wish_id, profile_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, user.id]);
}

/** Vira uma meta da família com o valor do desejo. */
export async function wishToGoal(user: SessionUser, id: string) {
  const w = await wishOf(user, id);
  if (w.status !== "open") throw new HttpError(400, "Esse desejo já virou meta ou foi comprado");
  const goal = await one<{ id: string }>(
    `INSERT INTO financial_goals (household_id, owner_id, name, icon, target_cents, scope) VALUES ($1, $2, $3, '🎁', $4, 'family') RETURNING id`,
    [user.household_id, user.id, w.name, num(w.price_cents)],
  );
  await query(`UPDATE wishes SET status = 'goal', goal_id = $2 WHERE id = $1`, [id, goal!.id]);
}

export async function markWishBought(user: SessionUser, id: string) {
  await wishOf(user, id);
  await query(`UPDATE wishes SET status = 'bought' WHERE id = $1`, [id]);
}

export async function deleteWish(user: SessionUser, id: string) {
  const w = await wishOf(user, id);
  if (w.created_by !== user.id && user.role !== "admin") throw new HttpError(403, "Só quem sugeriu (ou administra a família) pode apagar");
  await query(`DELETE FROM wishes WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Desafios

export async function listChallenges(user: SessionUser, today: string): Promise<Challenge[]> {
  const rows = await query<{ id: string; kind: ChallengeKind; starts_on: string; ends_on: string; status: Challenge["status"] }>(
    `SELECT id, kind, starts_on::text AS starts_on, ends_on::text AS ends_on, status FROM challenges
      WHERE profile_id = $1 ORDER BY (status = 'active') DESC, created_at DESC LIMIT 30`,
    [user.id],
  );
  if (!rows.length) return [];
  const from = rows.reduce((m, r) => (r.starts_on < m ? r.starts_on : m), rows[0].starts_on);
  const [txs, prev] = await batch(
    [
      q(
        `SELECT occurred_on::text AS occurred_on, description, amount_cents, direction, status FROM transactions
          WHERE profile_id = $1 AND NOT ignored AND occurred_on >= $2`,
        [user.id, from],
      ),
      q(
        `SELECT to_char(occurred_on, 'YYYY-MM') AS month, sum(amount_cents) AS cents FROM transactions
          WHERE profile_id = $1 AND NOT ignored AND direction = 'expense' AND occurred_on >= $2::date - 62
          GROUP BY 1`,
        [user.id, from],
      ),
    ],
    { readOnly: true },
  );
  const list = txs.map((t) => ({
    occurredOn: t.occurred_on as string,
    description: t.description as string,
    amountCents: num(t.amount_cents),
    direction: t.direction as string,
    status: t.status as string,
  }));
  const pendingByDay: Record<string, number> = {};
  for (const t of list) if (t.status === "pending") pendingByDay[t.occurredOn] = (pendingByDay[t.occurredOn] ?? 0) + 1;
  const result: Challenge[] = [];
  const updates = [];
  for (const r of rows) {
    const meta = CHALLENGES[r.kind];
    let progress = r.status === "won" ? 1 : 0;
    let detail = r.status === "abandoned" ? "Desistiu" : r.status === "won" ? "Conquistado! 🏆" : "Não deu desta vez";
    let status = r.status;
    if (r.status === "active") {
      const prevMonth = addMonths(r.starts_on.slice(0, 7), -1);
      const p = challengeProgress(r.kind, r.starts_on, r.ends_on, today, list, {
        previousMonthCents: num(prev.find((x) => x.month === prevMonth)?.cents),
        pendingAtEndOfDay: pendingByDay,
      });
      progress = p.progress;
      detail = p.detail;
      status = p.status;
      if (status !== "active") updates.push(q(`UPDATE challenges SET status = $2 WHERE id = $1 AND status = 'active'`, [r.id, status]));
    }
    result.push({ id: r.id, kind: r.kind, title: meta.title, icon: meta.icon, text: meta.text, startsOn: r.starts_on, endsOn: r.ends_on, status, progress, detail });
  }
  if (updates.length) await batch(updates);
  return result;
}

export async function startChallenge(user: SessionUser, kind: ChallengeKind, today: string) {
  const active = await one(`SELECT 1 FROM challenges WHERE profile_id = $1 AND kind = $2 AND status = 'active'`, [user.id, kind]);
  if (active) throw new HttpError(409, "Você já está nesse desafio");
  const month = today.slice(0, 7);
  const endsOn = kind === "spend_less" ? `${month}-${String(daysInMonth(month)).padStart(2, "0")}` : addDays(today, CHALLENGES[kind].days - 1);
  const startsOn = kind === "spend_less" ? `${month}-01` : today;
  await query(`INSERT INTO challenges (profile_id, kind, starts_on, ends_on) VALUES ($1, $2, $3, $4)`, [user.id, kind, startsOn, endsOn]);
}

export async function abandonChallenge(user: SessionUser, id: string) {
  await query(`UPDATE challenges SET status = 'abandoned' WHERE id = $1 AND profile_id = $2 AND status = 'active'`, [id, user.id]);
}

// ---------------------------------------------------------------------------
// Mesada

/** Última data de pagamento devida até hoje. */
export function lastDueDate(frequency: "weekly" | "monthly", payDay: number, today: string) {
  if (frequency === "monthly") {
    const month = today.slice(0, 7);
    const day = `${month}-${String(Math.min(payDay, daysInMonth(month))).padStart(2, "0")}`;
    return day <= today ? day : `${addMonths(month, -1)}-${String(Math.min(payDay, daysInMonth(addMonths(month, -1)))).padStart(2, "0")}`;
  }
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, -((weekday - payDay + 7) % 7));
}

/** Paga as mesadas vencidas (no máximo uma por pessoa por vez). Pode ser chamado a qualquer momento. */
export async function payDueAllowances(householdId?: string) {
  const rows = await query<{
    id: string; member_id: string; household_id: string; amount_cents: string; frequency: "weekly" | "monthly"; pay_day: number;
    last_paid_on: string | null; created_on: string; timezone: string; name: string; email: string; role: "admin" | "member"; avatar_color: string; digest_hour: number;
  }>(
    `SELECT a.id, a.member_id, a.household_id, a.amount_cents, a.frequency, a.pay_day, a.last_paid_on::text AS last_paid_on,
            a.created_at::date::text AS created_on, p.timezone, p.name, p.email, p.role, p.avatar_color, p.digest_hour
       FROM allowances a JOIN profiles p ON p.id = a.member_id
      WHERE a.active AND p.household_id = a.household_id AND ($1::uuid IS NULL OR a.household_id = $1)`,
    [householdId ?? null],
  );
  let paid = 0;
  for (const a of rows) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: a.timezone });
    const due = lastDueDate(a.frequency, a.pay_day, today);
    if (due < a.created_on || (a.last_paid_on && a.last_paid_on >= due)) continue;
    // Marca antes de lançar: duas execuções ao mesmo tempo não pagam duas vezes
    const claimed = await one(
      `UPDATE allowances SET last_paid_on = $2 WHERE id = $1 AND (last_paid_on IS NULL OR last_paid_on < $2) RETURNING id`,
      [a.id, due],
    );
    if (!claimed) continue;
    const member: SessionUser = {
      id: a.member_id, household_id: a.household_id, name: a.name, email: a.email, role: a.role,
      avatar_color: a.avatar_color, timezone: a.timezone, digest_hour: a.digest_hour, default_scope: "personal", session_id: "",
    };
    await insertTransaction(member, {
      description: "Mesada",
      amountCents: num(a.amount_cents),
      direction: "income",
      occurredOn: due,
      accountId: null,
      method: null,
      source: "allowance",
      status: "confirmed",
      classifiedBy: "user",
      allocations: [{ categoryId: "mesada", amountCents: num(a.amount_cents), scope: "personal" }],
    });
    paid++;
  }
  return paid;
}

export async function listAllowances(user: SessionUser, today: string): Promise<Allowance[]> {
  await payDueAllowances(user.household_id);
  const { start, end } = monthRange(today.slice(0, 7));
  const rows = await query(
    `SELECT a.id, a.member_id, p.name, a.amount_cents, a.frequency, a.pay_day, a.limit_cents, a.last_paid_on::text AS last_paid_on,
            CASE WHEN a.member_id = $2 THEN (
              SELECT coalesce(sum(t.amount_cents), 0) FROM transactions t
               WHERE t.profile_id = $2 AND t.direction = 'expense' AND NOT t.ignored AND t.occurred_on >= $3 AND t.occurred_on < $4
            ) END AS spent
       FROM allowances a JOIN profiles p ON p.id = a.member_id
      WHERE a.household_id = $1 AND a.active AND ($5 OR a.member_id = $2)
      ORDER BY p.name`,
    [user.household_id, user.id, start, end, user.role === "admin"],
  );
  return rows.map((r) => ({
    id: r.id as string,
    memberId: r.member_id as string,
    memberName: r.name as string,
    amountCents: num(r.amount_cents),
    frequency: r.frequency as Allowance["frequency"],
    payDay: num(r.pay_day),
    limitCents: r.limit_cents === null ? null : num(r.limit_cents),
    lastPaidOn: (r.last_paid_on as string | null) ?? null,
    spentThisMonthCents: r.spent === null || r.spent === undefined ? null : num(r.spent),
    isMe: r.member_id === user.id,
  }));
}

export async function setAllowance(
  user: SessionUser,
  input: { memberId: string; amountCents: number; frequency: "weekly" | "monthly"; payDay: number; limitCents: number | null },
) {
  if (user.role !== "admin") throw new HttpError(403, "Só quem administra a família define mesadas");
  if (input.memberId === user.id) throw new HttpError(400, "A mesada é para outro integrante");
  const member = await one(`SELECT 1 FROM profiles WHERE id = $1 AND household_id = $2 AND NOT is_demo`, [input.memberId, user.household_id]);
  if (!member) throw new HttpError(404, "Integrante não encontrado");
  if (input.frequency === "weekly" ? input.payDay < 0 || input.payDay > 6 : input.payDay < 1 || input.payDay > 28)
    throw new HttpError(400, "Dia de pagamento inválido");
  await query(
    `INSERT INTO allowances (household_id, member_id, amount_cents, frequency, pay_day, limit_cents, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (member_id) DO UPDATE SET household_id = $1, amount_cents = $3, frequency = $4, pay_day = $5, limit_cents = $6, active = true`,
    [user.household_id, input.memberId, input.amountCents, input.frequency, input.payDay, input.limitCents, user.id],
  );
}

export async function deleteAllowance(user: SessionUser, id: string) {
  if (user.role !== "admin") throw new HttpError(403, "Só quem administra a família muda mesadas");
  await query(`UPDATE allowances SET active = false WHERE id = $1 AND household_id = $2`, [id, user.household_id]);
}
