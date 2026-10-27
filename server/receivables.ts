// Dinheiro que some sem ninguém ver: valores a receber, custo dos bancos, pontos que vencem e dinheiro parado.
// Tudo pessoal: cada consulta filtra pelo dono.
import { feeKind } from "../shared/bank-fees.js";
import type { BankCosts, Insight, Loyalty, Receivable } from "../shared/types.js";
import { formatMoney } from "../shared/money.js";
import { addMonths, daysBetween } from "../shared/time.js";
import type { SessionUser } from "./auth.js";
import { num, one, query } from "./db.js";
import { accountBalances, insertTransaction } from "./finance.js";
import { HttpError } from "./http.js";

// ---------------------------------------------------------------------------
// Valores a receber

export async function listReceivables(user: SessionUser, today: string): Promise<Receivable[]> {
  const rows = await query(
    `SELECT id, name, kind, amount_cents, expected_on::text AS expected_on, received_at
       FROM receivables
      WHERE profile_id = $1 AND (received_at IS NULL OR received_at > now() - interval '90 days')
      ORDER BY (received_at IS NOT NULL), expected_on NULLS LAST, created_at`,
    [user.id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as Receivable["kind"],
    amountCents: num(r.amount_cents),
    expectedOn: (r.expected_on as string | null) ?? null,
    received: r.received_at !== null,
    receivedAt: r.received_at ? new Date(r.received_at as string).toISOString() : null,
    overdue: r.received_at === null && r.expected_on !== null && (r.expected_on as string) < today,
  }));
}

export async function createReceivable(
  user: SessionUser,
  input: { name: string; kind: Receivable["kind"]; amountCents: number; expectedOn: string | null },
) {
  const open = await one<{ n: number }>(`SELECT count(*)::int AS n FROM receivables WHERE profile_id = $1 AND received_at IS NULL`, [user.id]);
  if ((open?.n ?? 0) >= 100) throw new HttpError(400, "Limite de 100 valores a receber em aberto");
  await query(`INSERT INTO receivables (profile_id, name, kind, amount_cents, expected_on) VALUES ($1, $2, $3, $4, $5)`, [
    user.id,
    input.name,
    input.kind,
    input.amountCents,
    input.expectedOn,
  ]);
}

/** Marca como recebido e lança a receita (reembolso, restituição, empréstimo devolvido…). */
export async function receive(user: SessionUser, id: string, amountCents: number | null, receivedOn: string, createTransaction: boolean) {
  const row = await one<{ name: string; kind: string; amount_cents: string }>(
    `UPDATE receivables SET received_at = now() WHERE id = $1 AND profile_id = $2 AND received_at IS NULL
     RETURNING name, kind, amount_cents`,
    [id, user.id],
  );
  if (!row) throw new HttpError(404, "Valor a receber não encontrado");
  if (!createTransaction) return;
  const cents = amountCents ?? num(row.amount_cents);
  const categoryId = row.kind === "saude" || row.kind === "empresa" ? "reembolso" : "outras-receitas";
  const txId = await insertTransaction(user, {
    description: row.name,
    amountCents: cents,
    direction: "income",
    occurredOn: receivedOn,
    accountId: null,
    method: null,
    source: "manual",
    status: "confirmed",
    classifiedBy: "user",
    allocations: [{ categoryId, amountCents: cents, scope: "personal" }],
  });
  await query(`UPDATE receivables SET transaction_id = $2 WHERE id = $1`, [id, txId]);
}

export async function deleteReceivable(user: SessionUser, id: string) {
  const row = await one(`DELETE FROM receivables WHERE id = $1 AND profile_id = $2 RETURNING id`, [id, user.id]);
  if (!row) throw new HttpError(404, "Valor a receber não encontrado");
}

// ---------------------------------------------------------------------------
// Quanto os bancos custaram

export async function bankCosts(user: SessionUser, year: number): Promise<BankCosts> {
  const rows = await query(
    `SELECT t.occurred_on::text AS occurred_on, t.description, t.amount_cents, fa.name AS account_name
       FROM transactions t LEFT JOIN financial_accounts fa ON fa.id = t.account_id
      WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored
        AND t.occurred_on >= $2::date AND t.occurred_on < $3::date
      ORDER BY t.occurred_on DESC`,
    [user.id, `${year}-01-01`, `${year + 1}-01-01`],
  );
  const items = rows
    .map((r) => ({
      occurredOn: r.occurred_on as string,
      description: r.description as string,
      amountCents: num(r.amount_cents),
      kind: feeKind(r.description as string),
      accountName: (r.account_name as string | null) ?? null,
    }))
    .filter((i): i is typeof i & { kind: NonNullable<typeof i.kind> } => i.kind !== null);
  const byKind = new Map<string, { cents: number; count: number }>();
  const byAccount = new Map<string, number>();
  for (const i of items) {
    const k = byKind.get(i.kind) ?? { cents: 0, count: 0 };
    k.cents += i.amountCents;
    k.count++;
    byKind.set(i.kind, k);
    const account = i.accountName ?? "Sem conta";
    byAccount.set(account, (byAccount.get(account) ?? 0) + i.amountCents);
  }
  return {
    year,
    totalCents: items.reduce((s, i) => s + i.amountCents, 0),
    byKind: [...byKind.entries()].map(([kind, v]) => ({ kind: kind as BankCosts["byKind"][number]["kind"], ...v })).sort((a, b) => b.cents - a.cents),
    byAccount: [...byAccount.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents),
    items: items.slice(0, 100),
  };
}

// ---------------------------------------------------------------------------
// Pontos, milhas e cashback

export async function listLoyalty(user: SessionUser, today: string): Promise<Loyalty[]> {
  const rows = await query(
    `SELECT id, program, kind, balance, value_cents, expires_on::text AS expires_on, updated_on::text AS updated_on
       FROM loyalty WHERE profile_id = $1 ORDER BY expires_on NULLS LAST, program`,
    [user.id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    program: r.program as string,
    kind: r.kind as Loyalty["kind"],
    balance: num(r.balance),
    valueCents: r.value_cents === null ? null : num(r.value_cents),
    expiresOn: (r.expires_on as string | null) ?? null,
    updatedOn: r.updated_on as string,
    daysLeft: r.expires_on ? daysBetween(today, r.expires_on as string) : null,
  }));
}

export async function saveLoyalty(user: SessionUser, input: Omit<Loyalty, "id" | "daysLeft">, id?: string) {
  if (id) {
    const row = await one(
      `UPDATE loyalty SET program = $3, kind = $4, balance = $5, value_cents = $6, expires_on = $7, updated_on = $8
        WHERE id = $1 AND profile_id = $2 RETURNING id`,
      [id, user.id, input.program, input.kind, input.balance, input.valueCents, input.expiresOn, input.updatedOn],
    );
    if (!row) throw new HttpError(404, "Programa não encontrado");
    return;
  }
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM loyalty WHERE profile_id = $1`, [user.id]);
  if ((count?.n ?? 0) >= 30) throw new HttpError(400, "Limite de 30 programas");
  await query(
    `INSERT INTO loyalty (profile_id, program, kind, balance, value_cents, expires_on, updated_on) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, input.program, input.kind, input.balance, input.valueCents, input.expiresOn, input.updatedOn],
  );
}

export async function deleteLoyalty(user: SessionUser, id: string) {
  const row = await one(`DELETE FROM loyalty WHERE id = $1 AND profile_id = $2 RETURNING id`, [id, user.id]);
  if (!row) throw new HttpError(404, "Programa não encontrado");
}

// ---------------------------------------------------------------------------
// Avisos da visão geral desta parte

/** Gasto médio mensal dos últimos 3 meses completos (só da pessoa). */
export async function averageMonthlyExpense(user: SessionUser, today: string) {
  const month = today.slice(0, 7);
  const row = await one<{ cents: string }>(
    `SELECT coalesce(sum(amount_cents), 0) AS cents FROM transactions
      WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND occurred_on >= $2::date AND occurred_on < $3::date`,
    [user.id, `${addMonths(month, -3)}-01`, `${month}-01`],
  );
  return Math.round(num(row?.cents) / 3);
}

export async function moneyInsights(user: SessionUser, today: string): Promise<Insight[]> {
  const insights: Insight[] = [];
  const [receivables, loyalty, balances, accounts, avg] = await Promise.all([
    listReceivables(user, today),
    listLoyalty(user, today),
    accountBalances(user, today),
    query<{ id: string; name: string; kind: string; is_reserve: boolean }>(
      `SELECT id, name, kind, is_reserve FROM financial_accounts WHERE profile_id = $1 AND active`,
      [user.id],
    ),
    averageMonthlyExpense(user, today),
  ]);
  const overdue = receivables.filter((r) => r.overdue);
  if (overdue.length)
    insights.push({
      id: "receivables",
      icon: "💸",
      title: `${formatMoney(overdue.reduce((s, r) => s + r.amountCents, 0))} para receber já passaram da data`,
      text: `${overdue.map((r) => r.name).slice(0, 2).join(", ")}${overdue.length > 2 ? "…" : ""}. Vale cobrar ou conferir.`,
      page: "receber",
    });
  const expiring = loyalty.find((l) => l.daysLeft !== null && l.daysLeft >= 0 && l.daysLeft <= 30 && l.balance > 0);
  if (expiring)
    insights.push({
      id: `loyalty-${expiring.id}`,
      icon: "⏳",
      title: `${expiring.balance.toLocaleString("pt-BR")} ${expiring.kind} do ${expiring.program} vencem em ${expiring.daysLeft} dia(s)`,
      text: "Use ou transfira antes que se percam.",
      page: "pontos",
    });
  // Dinheiro parado: muito saldo na conta corrente (fora da reserva) em relação ao que se gasta
  const idle = accounts
    .filter((a) => (a.kind === "checking" || a.kind === "savings") && !a.is_reserve)
    .map((a) => ({ ...a, cents: balances.get(a.id)?.currentBalanceCents ?? 0 }))
    .filter((a) => a.cents > 0);
  const idleTotal = idle.reduce((s, a) => s + a.cents, 0);
  if (avg > 0 && idleTotal > Math.max(2 * avg, 200_000))
    insights.push({
      id: "idle-money",
      icon: "😴",
      title: `${formatMoney(idleTotal - avg)} parados além do mês`,
      text: idle.some((a) => a.kind === "savings")
        ? "A poupança costuma render menos que o Tesouro Selic ou um CDB de liquidez diária. Separe a reserva e faça o resto trabalhar."
        : "Dinheiro na conta corrente quase não rende. Deixe só o do mês e mova o resto para a reserva ou um investimento de liquidez diária.",
      page: "reserva",
    });
  return insights;
}
