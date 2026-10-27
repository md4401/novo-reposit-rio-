// Quem foge do padrão: renda variável, acompanhamento consentido (pais idosos) e modo criança.
// O acompanhamento mostra só totais, contas a pagar e alertas de golpe — nunca compras nem lojas.
import { bufferPath, suggestSalary } from "../shared/income.js";
import { addMonths, monthRange } from "../shared/time.js";
import type { GuardianInfo, GuardianSummary, IncomeOverview, KidSummary } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { listGoals, personalNumbers } from "./finance.js";
import { HttpError } from "./http.js";
import { payablesDue } from "./planning.js";
import { scamAlerts } from "./protection.js";

// ---------------------------------------------------------------------------
// Renda variável

export async function incomeOverview(user: SessionUser, today: string): Promise<IncomeOverview> {
  const month = today.slice(0, 7);
  const first = addMonths(month, -12);
  const [rows, profile] = await batch(
    [
      q(
        `SELECT to_char(occurred_on, 'YYYY-MM') AS month, sum(amount_cents) AS cents FROM transactions
          WHERE profile_id = $1 AND direction = 'income' AND NOT ignored AND occurred_on >= $2::date AND occurred_on < $3::date
          GROUP BY 1`,
        [user.id, `${first}-01`, `${month}-01`],
      ),
      q(`SELECT income_mode, self_salary_cents FROM profiles WHERE id = $1`, [user.id]),
    ],
    { readOnly: true },
  );
  const series = Array.from({ length: 12 }, (_, i) => addMonths(first, i)).map((m) => ({
    month: m,
    cents: num(rows.find((r) => r.month === m)?.cents),
  }));
  // Só a partir do primeiro mês com renda (quem começou agora não tem 12 meses)
  const start = series.findIndex((s) => s.cents > 0);
  const used = start < 0 ? [] : series.slice(start);
  const suggested = suggestSalary(used.map((s) => s.cents));
  const salary = profile[0]?.self_salary_cents == null ? suggested : num(profile[0].self_salary_cents);
  return {
    mode: (profile[0]?.income_mode as "fixed" | "variable") ?? "fixed",
    selfSalaryCents: profile[0]?.self_salary_cents == null ? null : num(profile[0].self_salary_cents),
    suggestedCents: suggested,
    averageCents: used.length ? Math.round(used.reduce((s, x) => s + x.cents, 0) / used.length) : 0,
    months: salary ? bufferPath(used, salary) : used.map((s) => ({ month: s.month, incomeCents: s.cents, diffCents: 0, bufferCents: 0 })),
  };
}

// ---------------------------------------------------------------------------
// Acompanhamento consentido

export async function guardianInfo(user: SessionUser): Promise<GuardianInfo> {
  const [guardians, watching] = await batch(
    [
      q(`SELECT p.id, p.name FROM guardians g JOIN profiles p ON p.id = g.guardian_id WHERE g.profile_id = $1 ORDER BY p.name`, [user.id]),
      q(`SELECT p.id, p.name FROM guardians g JOIN profiles p ON p.id = g.profile_id WHERE g.guardian_id = $1 AND p.household_id = $2 ORDER BY p.name`, [
        user.id,
        user.household_id,
      ]),
    ],
    { readOnly: true },
  );
  const map = (r: Record<string, unknown>) => ({ id: r.id as string, name: r.name as string });
  return { guardians: guardians.map(map), watching: watching.map(map) };
}

/** Só a própria pessoa autoriza alguém a acompanhar (e pode revogar quando quiser). */
export async function addGuardian(user: SessionUser, guardianId: string) {
  const ok = await one(`SELECT 1 FROM profiles WHERE id = $1 AND household_id = $2 AND NOT is_demo AND id <> $3`, [guardianId, user.household_id, user.id]);
  if (!ok) throw new HttpError(400, "Escolha alguém da família");
  await query(`INSERT INTO guardians (profile_id, guardian_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, guardianId]);
}

/** Revoga: quem é acompanhado tira o acompanhante, ou o acompanhante desiste. */
export async function removeGuardian(user: SessionUser, otherId: string) {
  await query(`DELETE FROM guardians WHERE (profile_id = $1 AND guardian_id = $2) OR (profile_id = $2 AND guardian_id = $1)`, [user.id, otherId]);
}

export async function guardianSummary(user: SessionUser, profileId: string, today: string): Promise<GuardianSummary> {
  const watched = await one<SessionUser>(
    `SELECT p.id, p.household_id, p.name, p.email, p.role, p.avatar_color, p.timezone, p.digest_hour, '' AS session_id
       FROM guardians g JOIN profiles p ON p.id = g.profile_id
      WHERE g.profile_id = $1 AND g.guardian_id = $2 AND p.household_id = $3`,
    [profileId, user.id, user.household_id],
  );
  if (!watched) throw new HttpError(404, "Você não acompanha esta pessoa");
  const month = today.slice(0, 7);
  const [numbers, due, scams] = await Promise.all([personalNumbers(watched, month, 2), payablesDue(watched, today), scamAlerts(watched, today)]);
  return {
    name: watched.name,
    month,
    incomeCents: numbers.totals.incomeCents,
    expenseCents: numbers.totals.expenseCents,
    previousExpenseCents: numbers.series[0]?.expenseCents ?? 0,
    pendingCount: numbers.counts.pending,
    bills: due.map((p) => ({ name: p.name, amountCents: p.amountCents, dueOn: p.dueOn, status: p.status })),
    // Sem o nome de quem recebeu: só o motivo, o valor e o dia
    alerts: scams.map((s) => ({ reason: s.reason, amountCents: s.amountCents, occurredOn: s.occurredOn })),
  };
}

// ---------------------------------------------------------------------------
// Modo de uso e modo criança

export async function setMemberMode(user: SessionUser, memberId: string, mode: "full" | "simple" | "kid") {
  if (memberId !== user.id && user.role !== "admin") throw new HttpError(403, "Só quem administra a família muda o modo de outra pessoa");
  const row = await one(`UPDATE profiles SET ui_mode = $3 WHERE id = $1 AND household_id = $2 AND NOT is_demo RETURNING id`, [memberId, user.household_id, mode]);
  if (!row) throw new HttpError(404, "Pessoa não encontrada");
}

export async function kidSummary(user: SessionUser, today: string): Promise<KidSummary> {
  const month = today.slice(0, 7);
  const { start, end } = monthRange(month);
  const [money, goals] = await Promise.all([
    one<{ allowance: string; spent: string }>(
      `SELECT coalesce(sum(amount_cents) FILTER (WHERE direction = 'income'), 0) AS allowance,
              coalesce(sum(amount_cents) FILTER (WHERE direction = 'expense'), 0) AS spent
         FROM transactions WHERE profile_id = $1 AND NOT ignored AND occurred_on >= $2 AND occurred_on < $3`,
      [user.id, start, end],
    ),
    listGoals(user),
  ]);
  const allowance = num(money?.allowance);
  const spent = num(money?.spent);
  return {
    month,
    allowanceCents: allowance,
    spentCents: spent,
    leftCents: allowance - spent,
    goals: goals.filter((g) => g.scope === "personal").map((g) => ({ id: g.id, name: g.name, icon: g.icon, savedCents: g.savedCents, targetCents: g.targetCents })),
  };
}
