// Fatura do cartão, contas a pagar e saldo previsto (sempre só da própria pessoa).
import { CATEGORY_BY_ID } from "../shared/categories.js";
import { installmentOf } from "../shared/merchant.js";
import { addMonths, addDays, daysBetween } from "../shared/time.js";
import { cycleFor, forecast, monthlySaving, nextDue, occurrences, openCycle, type ForecastEvent, type Recurrence } from "../shared/planning.js";
import type { CardInvoice, ForecastPayload, Payable } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { accountBalances, insertTransaction } from "./finance.js";
import { HttpError } from "./http.js";
import { loadAlerts } from "./alerts.js";

// ---------------------------------------------------------------------------
// Fatura

export async function cardInvoices(user: SessionUser, today: string): Promise<CardInvoice[]> {
  const cards = await query<{ id: string; name: string; closing_day: number; due_day: number }>(
    `SELECT id, name, closing_day, due_day FROM financial_accounts
      WHERE profile_id = $1 AND kind = 'credit_card' AND active AND closing_day IS NOT NULL AND due_day IS NOT NULL
      ORDER BY created_at, name, id`,
    [user.id],
  );
  if (!cards.length) return [];
  const from = addDays(today, -75);
  const rows = await query<{ account_id: string; occurred_on: string; description: string; amount_cents: string }>(
    `SELECT account_id, occurred_on::text AS occurred_on, description, amount_cents FROM transactions
      WHERE profile_id = $1 AND account_id = ANY($2::uuid[]) AND direction = 'expense' AND NOT ignored AND occurred_on >= $3`,
    [user.id, cards.map((c) => c.id), from],
  );
  const result: CardInvoice[] = [];
  for (const card of cards) {
    const open = openCycle(today, card.closing_day, card.due_day);
    const previous = cycleFor(addMonths(open.closeMonth, -1), card.closing_day, card.due_day);
    const mine = rows.filter((r) => r.account_id === card.id);
    const sum = (start: string, end: string) => mine.filter((r) => r.occurred_on >= start && r.occurred_on <= end).reduce((s, r) => s + num(r.amount_cents), 0);
    // Parcelas que ainda vão cair: a última de cada compra parcelada, nas faturas seguintes
    const installments = new Map<string, { amount: number; left: number }>();
    for (const r of mine.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
      const inst = installmentOf(r.description);
      if (inst) installments.set(r.description.replace(/\d{1,2}\s*(\/|de)\s*\d{1,2}/i, "").trim().toLowerCase(), { amount: num(r.amount_cents), left: inst.of - inst.n });
    }
    const projected = (k: number) => [...installments.values()].filter((i) => i.left >= k).reduce((s, i) => s + i.amount, 0);
    if (previous.dueOn >= today)
      result.push({ accountId: card.id, accountName: card.name, closingOn: previous.closingOn, dueOn: previous.dueOn, totalCents: sum(previous.start, previous.closingOn), status: "closed", installmentsCents: 0 });
    result.push({ accountId: card.id, accountName: card.name, closingOn: open.closingOn, dueOn: open.dueOn, totalCents: sum(open.start, open.closingOn), status: "open", installmentsCents: 0 });
    for (let k = 1; k <= 3; k++) {
      const c = cycleFor(addMonths(open.closeMonth, k), card.closing_day, card.due_day);
      const cents = projected(k);
      if (cents > 0) result.push({ accountId: card.id, accountName: card.name, closingOn: c.closingOn, dueOn: c.dueOn, totalCents: cents, status: "future", installmentsCents: cents });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Contas a pagar

function mapPayable(r: Record<string, unknown>, today: string): Payable {
  const dueOn = r.due_on as string;
  const daysLeft = daysBetween(today, dueOn);
  const remindDays = num(r.remind_days);
  const seasonal = Boolean(r.seasonal);
  return {
    id: r.id as string,
    name: r.name as string,
    categoryId: r.category_id as string,
    amountCents: num(r.amount_cents),
    dueOn,
    recurrence: r.recurrence as Recurrence,
    remindDays,
    accountId: (r.account_id as string | null) ?? null,
    seasonal,
    daysLeft,
    monthlySavingCents: seasonal && daysLeft > 31 ? monthlySaving(num(r.amount_cents), today, dueOn) : null,
    status: daysLeft < 0 ? "overdue" : daysLeft <= remindDays ? "soon" : "ok",
  };
}

export async function listPayables(user: SessionUser, today: string) {
  const rows = await query(
    `SELECT id, name, category_id, amount_cents, due_on::text AS due_on, recurrence, remind_days, account_id, seasonal
       FROM payables WHERE profile_id = $1 AND active ORDER BY due_on, name, id`,
    [user.id],
  );
  return rows.map((r) => mapPayable(r, today));
}

export type PayableInput = {
  name: string;
  categoryId: string;
  amountCents: number;
  dueOn: string;
  recurrence: Recurrence;
  remindDays: number;
  accountId: string | null;
  seasonal: boolean;
};

export function validatePayable(input: PayableInput) {
  if (CATEGORY_BY_ID.get(input.categoryId)?.kind !== "expense") throw new HttpError(400, "Escolha uma categoria de gasto");
}

export async function savePayable(user: SessionUser, input: PayableInput, id?: string) {
  validatePayable(input);
  if (input.accountId) {
    const ok = await one(`SELECT 1 FROM financial_accounts WHERE id = $1 AND profile_id = $2`, [input.accountId, user.id]);
    if (!ok) throw new HttpError(404, "Conta não encontrada");
  }
  const params = [user.id, input.name, input.categoryId, input.amountCents, input.dueOn, input.recurrence, input.remindDays, input.accountId, input.seasonal];
  if (id) {
    const row = await one(
      `UPDATE payables SET name = $2, category_id = $3, amount_cents = $4, due_on = $5, recurrence = $6, remind_days = $7,
              account_id = $8, seasonal = $9 WHERE id = $10 AND profile_id = $1 RETURNING id`,
      [...params, id],
    );
    if (!row) throw new HttpError(404, "Conta a pagar não encontrada");
    return id;
  }
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM payables WHERE profile_id = $1 AND active`, [user.id]);
  if ((count?.n ?? 0) >= 100) throw new HttpError(400, "Limite de 100 contas a pagar");
  const row = await one<{ id: string }>(
    `INSERT INTO payables (profile_id, name, category_id, amount_cents, due_on, recurrence, remind_days, account_id, seasonal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    params,
  );
  return row!.id;
}

/** "Paguei": cria a despesa, registra o pagamento e passa para o próximo vencimento. */
export async function payPayable(user: SessionUser, id: string, amountCents: number | null, paidOn: string) {
  const p = await one<{ id: string; name: string; category_id: string; amount_cents: string; due_on: string; recurrence: Recurrence; account_id: string | null }>(
    `SELECT id, name, category_id, amount_cents, due_on::text AS due_on, recurrence, account_id FROM payables
      WHERE id = $1 AND profile_id = $2 AND active`,
    [id, user.id],
  );
  if (!p) throw new HttpError(404, "Conta a pagar não encontrada");
  const cents = amountCents ?? num(p.amount_cents);
  const txId = await insertTransaction(user, {
    description: p.name,
    amountCents: cents,
    direction: "expense",
    occurredOn: paidOn,
    accountId: p.account_id,
    method: null,
    source: "manual",
    status: "confirmed",
    classifiedBy: "user",
    allocations: [{ categoryId: p.category_id, amountCents: cents, scope: "personal" }],
  });
  const next = nextDue(p.due_on, p.recurrence);
  await batch([
    q(`INSERT INTO payable_payments (payable_id, due_on, amount_cents, transaction_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [p.id, p.due_on, cents, txId]),
    next
      ? q(`UPDATE payables SET due_on = $2 WHERE id = $1`, [p.id, next])
      : q(`UPDATE payables SET active = false WHERE id = $1`, [p.id]),
  ]);
  return txId;
}

export async function deletePayable(user: SessionUser, id: string) {
  await query(`UPDATE payables SET active = false WHERE id = $1 AND profile_id = $2`, [id, user.id]);
}

/** Contas que pedem atenção hoje (vencidas ou dentro do prazo do lembrete). */
export async function payablesDue(user: SessionUser, today: string) {
  return (await listPayables(user, today)).filter((p) => p.status !== "ok");
}

// ---------------------------------------------------------------------------
// Saldo previsto

export async function loadForecast(user: SessionUser, today: string, days = 30): Promise<ForecastPayload> {
  const until = addDays(today, days);
  const [balances, payables, invoices, alerts, extra] = await Promise.all([
    accountBalances(user, today),
    listPayables(user, today),
    cardInvoices(user, today),
    loadAlerts(user),
    batch(
      [
        q(
          `SELECT t.occurred_on::text AS occurred_on, t.amount_cents FROM transactions t
             JOIN transaction_allocations a ON a.transaction_id = t.id
            WHERE t.profile_id = $1 AND t.direction = 'income' AND NOT t.ignored AND a.category_id = 'salario'
              AND t.occurred_on > $2::date - 100
            ORDER BY t.occurred_on`,
          [user.id, today],
        ),
        q(
          `SELECT DISTINCT ON (t.merchant) t.merchant, fa.kind FROM transactions t LEFT JOIN financial_accounts fa ON fa.id = t.account_id
            WHERE t.profile_id = $1 AND t.direction = 'expense' AND t.occurred_on > $2::date - 100
            ORDER BY t.merchant, t.occurred_on DESC`,
          [user.id, today],
        ),
      ],
      { readOnly: true },
    ),
  ]);
  const [salaries, merchantAccounts] = extra;
  // Ponto de partida: soma dos saldos informados de conta corrente, poupança e dinheiro
  let start = 0;
  let known = false;
  const accountKinds = await query<{ id: string; kind: string }>(`SELECT id, kind FROM financial_accounts WHERE profile_id = $1 AND active`, [user.id]);
  for (const a of accountKinds) {
    const b = balances.get(a.id);
    if (a.kind !== "credit_card" && b?.currentBalanceCents !== null && b?.currentBalanceCents !== undefined) {
      start += b.currentBalanceCents;
      known = true;
    }
  }
  const events: ForecastEvent[] = [];
  for (const p of payables)
    for (const on of occurrences(p.dueOn < today ? addDays(today, 1) : p.dueOn, p.recurrence, until))
      events.push({ on, label: p.name, amountCents: -p.amountCents, kind: "bill" });
  for (const inv of invoices)
    if (inv.dueOn > today && inv.dueOn <= until && inv.totalCents > 0)
      events.push({ on: inv.dueOn, label: `Fatura ${inv.accountName}`, amountCents: -inv.totalCents, kind: "card" });
  const onCard = new Set(merchantAccounts.filter((m) => m.kind === "credit_card").map((m) => m.merchant as string));
  for (const r of alerts.recurring)
    if (r.nextExpectedOn && !onCard.has(r.merchant) && r.intervalDays <= 35)
      for (const on of occurrences(r.nextExpectedOn, "monthly", until))
        if (on > today) events.push({ on, label: r.label, amountCents: -r.lastAmountCents, kind: "subscription" });
  // Salário: mesmo dia e valor do último recebido, se veio nos últimos meses
  if (salaries.length) {
    const last = salaries[salaries.length - 1];
    for (const on of occurrences(nextDue(last.occurred_on as string, "monthly")!, "monthly", until))
      if (on > today) events.push({ on, label: "Salário (previsto)", amountCents: num(last.amount_cents), kind: "income" });
  }
  return { startCents: start, knownBalance: known, ...forecast(start, today, days, events) };
}
