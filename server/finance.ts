// Motor financeiro: leituras e gravações com regra de dono. Totais saem do SQL,
// nunca do texto da IA. A visão da família só usa divisões marcadas como "familiar".
import { randomUUID } from "node:crypto";
import { CATEGORY_BY_ID } from "../shared/categories.js";
import { checkAllocations, formatMoney } from "../shared/money.js";
import { normalizeMerchant, stripAccents } from "../shared/merchant.js";
import { addMonths, monthRange } from "../shared/time.js";
import type {
  Allocation,
  CategoryTotal,
  Direction,
  Goal,
  MonthTotals,
  SeriesPoint,
  Transaction,
} from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query, type Row } from "./db.js";
import { HttpError } from "./http.js";

export const NO_ACCOUNT = "00000000-0000-0000-0000-000000000000";

export const TX_SELECT = `
  SELECT t.id, t.occurred_on::text AS occurred_on, t.description, t.merchant, t.amount_cents, t.direction, t.status,
         t.classified_by, t.source, t.account_id, fa.name AS account_name, t.method, t.ignored, t.notes,
         coalesce((SELECT json_agg(json_build_object('categoryId', a.category_id, 'amountCents', a.amount_cents,
                                                     'scope', a.scope) ORDER BY a.position)
                     FROM transaction_allocations a WHERE a.transaction_id = t.id), '[]') AS allocations
    FROM transactions t
    LEFT JOIN financial_accounts fa ON fa.id = t.account_id`;

export function mapTransaction(r: Row): Transaction {
  return {
    id: r.id as string,
    occurredOn: r.occurred_on as string,
    description: r.description as string,
    merchant: r.merchant as string,
    amountCents: num(r.amount_cents),
    direction: r.direction as Direction,
    status: r.status as Transaction["status"],
    classifiedBy: (r.classified_by as Transaction["classifiedBy"]) ?? null,
    source: r.source as Transaction["source"],
    accountId: (r.account_id as string | null) ?? null,
    accountName: (r.account_name as string | null) ?? null,
    method: (r.method as string | null) ?? null,
    ignored: Boolean(r.ignored),
    notes: (r.notes as string | null) ?? null,
    allocations: ((r.allocations as Allocation[]) ?? []).map((a) => ({ ...a, amountCents: num(a.amountCents) })),
  };
}

export type TxFilter = { month?: string; q?: string; status?: string; scope?: string; accountId?: string; limit?: number };

/** Só transações da própria pessoa. */
export async function listTransactions(user: SessionUser, filter: TxFilter = {}) {
  const where = ["t.profile_id = $1"];
  const params: unknown[] = [user.id];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filter.month) {
    const { start, end } = monthRange(filter.month);
    add("t.occurred_on >= ?", start);
    add("t.occurred_on < ?", end);
  }
  if (filter.q) {
    params.push(`%${filter.q}%`, `%${stripAccents(filter.q.toLowerCase())}%`);
    where.push(`(t.description ILIKE $${params.length - 1} OR t.merchant LIKE $${params.length})`);
  }
  if (filter.status === "pending") where.push("t.status = 'pending' AND NOT t.ignored");
  if (filter.status === "ignored") where.push("t.ignored");
  if (filter.scope === "family" || filter.scope === "personal")
    add("EXISTS (SELECT 1 FROM transaction_allocations a WHERE a.transaction_id = t.id AND a.scope = ?)", filter.scope);
  if (filter.accountId) add("t.account_id = ?", filter.accountId);
  const rows = await query(
    `${TX_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.occurred_on DESC, t.created_at DESC LIMIT ${Math.min(filter.limit ?? 300, 1000)}`,
    params,
  );
  return rows.map(mapTransaction);
}

export async function getTransaction(user: SessionUser, id: string) {
  const row = await one(`${TX_SELECT} WHERE t.id = $1 AND t.profile_id = $2`, [id, user.id]);
  if (!row) throw new HttpError(404, "Transação não encontrada");
  return mapTransaction(row);
}

/** Confere categorias x tipo de movimentação e a soma exata. */
export function validateAllocations(direction: Direction, amountCents: number, allocations: Allocation[]) {
  for (const a of allocations) {
    const category = CATEGORY_BY_ID.get(a.categoryId);
    if (!category) throw new HttpError(400, "Categoria inválida");
    if (category.kind !== direction) throw new HttpError(400, `“${category.name}” não combina com esse tipo de movimentação`);
    if (a.scope !== "personal" && a.scope !== "family") throw new HttpError(400, "Visibilidade inválida");
  }
  const check = checkAllocations(amountCents, allocations);
  if (check.invalid) throw new HttpError(400, "Cada categoria precisa ter um valor maior que zero");
  if (!check.ok)
    throw new HttpError(
      400,
      `A divisão precisa fechar ${formatMoney(amountCents)}. ${check.diff > 0 ? "Faltam" : "Sobram"} ${formatMoney(Math.abs(check.diff))}.`,
    );
}

export function parseAllocations(value: unknown): Allocation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw new HttpError(400, "Divisão inválida");
  return value.map((v) => {
    const item = v as Record<string, unknown>;
    return {
      categoryId: String(item.categoryId ?? ""),
      amountCents: Number(item.amountCents),
      scope: item.scope === "family" ? "family" : "personal",
    };
  });
}

export function allocationRows(transactionId: string, profileId: string, allocations: Allocation[]) {
  return JSON.stringify(
    allocations.map((a, i) => ({
      transaction_id: transactionId,
      profile_id: profileId,
      category_id: a.categoryId,
      amount_cents: a.amountCents,
      scope: a.scope,
      position: i,
    })),
  );
}

export const INSERT_ALLOCATIONS = `
  INSERT INTO transaction_allocations (transaction_id, profile_id, category_id, amount_cents, scope, position)
  SELECT x.transaction_id, x.profile_id, x.category_id, x.amount_cents, x.scope, x.position
    FROM json_to_recordset($1::json) AS x(transaction_id uuid, profile_id uuid, category_id text,
                                         amount_cents bigint, scope text, position smallint)`;

export async function assertAccount(user: SessionUser, accountId: string | null) {
  if (!accountId) return;
  const ok = await one(`SELECT 1 FROM financial_accounts WHERE id = $1 AND profile_id = $2`, [accountId, user.id]);
  if (!ok) throw new HttpError(404, "Conta não encontrada");
}

export async function insertTransaction(
  user: SessionUser,
  input: {
    description: string;
    amountCents: number;
    direction: Direction;
    occurredOn: string;
    accountId: string | null;
    method: string | null;
    source: Transaction["source"];
    status: Transaction["status"];
    classifiedBy: Transaction["classifiedBy"];
    allocations: Allocation[];
    notes?: string | null;
  },
) {
  const id = randomUUID();
  const queries = [
    q(
      `INSERT INTO transactions (id, profile_id, account_id, occurred_on, description, merchant, amount_cents, direction,
                                 status, classified_by, source, method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        user.id,
        input.accountId,
        input.occurredOn,
        input.description,
        normalizeMerchant(input.description),
        input.amountCents,
        input.direction,
        input.status,
        input.classifiedBy,
        input.source,
        input.method,
        input.notes ?? null,
      ],
    ),
  ];
  if (input.allocations.length) queries.push(q(INSERT_ALLOCATIONS, [allocationRows(id, user.id, input.allocations)]));
  if (input.accountId)
    queries.push(q(`UPDATE financial_accounts SET last_synced_at = now() WHERE id = $1 AND profile_id = $2`, [input.accountId, user.id]));
  await batch(queries);
  return id;
}

// ---------------------------------------------------------------------------
// Totais

function seriesFrom(rows: Row[], firstMonth: string, months: number): SeriesPoint[] {
  const map = new Map(rows.map((r) => [r.month as string, r]));
  return Array.from({ length: months }, (_, i) => {
    const month = addMonths(firstMonth, i);
    const r = map.get(month);
    return { month, incomeCents: num(r?.income), expenseCents: num(r?.expense) };
  });
}

function totals(row: Row | undefined): MonthTotals {
  const incomeCents = num(row?.income);
  const expenseCents = num(row?.expense);
  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents };
}

/** Totais da pessoa: valor cheio das próprias transações (pessoais e familiares). */
export async function personalNumbers(user: SessionUser, month: string, months = 6) {
  const { start, end } = monthRange(month);
  const firstMonth = addMonths(month, -(months - 1));
  const [monthRow, categories, series, counts, rules] = await batch(
    [
      q(
        `SELECT sum(amount_cents) FILTER (WHERE direction = 'income') AS income,
                sum(amount_cents) FILTER (WHERE direction = 'expense') AS expense
           FROM transactions WHERE profile_id = $1 AND NOT ignored AND occurred_on >= $2 AND occurred_on < $3`,
        [user.id, start, end],
      ),
      q(
        `SELECT coalesce(a.category_id, '_pendente') AS category_id, sum(coalesce(a.amount_cents, t.amount_cents)) AS cents
           FROM transactions t LEFT JOIN transaction_allocations a ON a.transaction_id = t.id
          WHERE t.profile_id = $1 AND NOT t.ignored AND t.direction = 'expense'
            AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1 ORDER BY 2 DESC`,
        [user.id, start, end],
      ),
      q(
        `SELECT to_char(occurred_on, 'YYYY-MM') AS month,
                sum(amount_cents) FILTER (WHERE direction = 'income') AS income,
                sum(amount_cents) FILTER (WHERE direction = 'expense') AS expense
           FROM transactions WHERE profile_id = $1 AND NOT ignored AND occurred_on >= $2 AND occurred_on < $3
          GROUP BY 1`,
        [user.id, `${firstMonth}-01`, end],
      ),
      q(
        `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
                count(*) FILTER (WHERE status <> 'pending')::int AS categorized, count(*)::int AS total
           FROM transactions WHERE profile_id = $1 AND NOT ignored AND direction <> 'transfer'
            AND occurred_on >= $2 AND occurred_on < $3`,
        [user.id, start, end],
      ),
      q(`SELECT count(*)::int AS n FROM categorization_rules WHERE profile_id = $1 AND active`, [user.id]),
    ],
    { readOnly: true },
  );
  return {
    totals: totals(monthRow[0]),
    categories: categories.map((c): CategoryTotal => ({ categoryId: c.category_id as string, cents: num(c.cents) })),
    series: seriesFrom(series, firstMonth, months),
    counts: { pending: num(counts[0].pending), categorized: num(counts[0].categorized), total: num(counts[0].total) },
    activeRules: num(rules[0].n),
  };
}

/** Agregados da família: só divisões "familiar", sem lojas, sem nomes, sem linhas individuais. */
export async function familyNumbers(user: SessionUser, month: string, months = 7) {
  const { start, end } = monthRange(month);
  const firstMonth = addMonths(month, -(months - 1));
  const base = `FROM transaction_allocations a
                JOIN transactions t ON t.id = a.transaction_id
                JOIN profiles p ON p.id = t.profile_id
               WHERE p.household_id = $1 AND a.scope = 'family' AND NOT t.ignored`;
  const [monthRow, previous, categories, series, stale] = await batch(
    [
      q(
        `SELECT sum(a.amount_cents) FILTER (WHERE t.direction = 'income') AS income,
                sum(a.amount_cents) FILTER (WHERE t.direction = 'expense') AS expense
           ${base} AND t.occurred_on >= $2 AND t.occurred_on < $3`,
        [user.household_id, start, end],
      ),
      q(
        `SELECT sum(a.amount_cents) FILTER (WHERE t.direction = 'expense') AS expense
           ${base} AND t.occurred_on >= $2 AND t.occurred_on < $3`,
        [user.household_id, `${addMonths(month, -1)}-01`, start],
      ),
      q(
        `SELECT a.category_id, sum(a.amount_cents) AS cents
           ${base} AND t.direction = 'expense' AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1 ORDER BY 2 DESC`,
        [user.household_id, start, end],
      ),
      q(
        `SELECT to_char(t.occurred_on, 'YYYY-MM') AS month,
                sum(a.amount_cents) FILTER (WHERE t.direction = 'income') AS income,
                sum(a.amount_cents) FILTER (WHERE t.direction = 'expense') AS expense
           ${base} AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1`,
        [user.household_id, `${firstMonth}-01`, end],
      ),
      // Aviso genérico de integridade: não revela de quem é a conta desatualizada
      q(
        `SELECT EXISTS (
           SELECT 1 FROM financial_accounts fa JOIN profiles p ON p.id = fa.profile_id
            WHERE p.household_id = $1 AND fa.active AND fa.kind <> 'cash'
              AND (fa.last_synced_at IS NULL OR fa.last_synced_at < now() - interval '7 days')
         ) AS stale`,
        [user.household_id],
      ),
    ],
    { readOnly: true },
  );
  return {
    totals: totals(monthRow[0]),
    previousExpenseCents: num(previous[0]?.expense),
    categories: categories.map((c): CategoryTotal => ({ categoryId: c.category_id as string, cents: num(c.cents) })),
    series: seriesFrom(series, firstMonth, months),
    dataWarning: Boolean(stale[0]?.stale),
  };
}

// ---------------------------------------------------------------------------
// Metas

export async function listGoals(user: SessionUser): Promise<Goal[]> {
  const rows = await query(
    `SELECT g.id, g.name, g.icon, g.target_cents, g.scope, g.deadline::text AS deadline, g.owner_id,
            coalesce(sum(c.amount_cents), 0) AS saved,
            coalesce(sum(c.amount_cents) FILTER (WHERE c.profile_id = $2), 0) AS mine
       FROM financial_goals g LEFT JOIN goal_contributions c ON c.goal_id = g.id
      WHERE g.household_id = $1 AND (g.scope = 'family' OR g.owner_id = $2)
      GROUP BY g.id ORDER BY g.scope DESC, g.created_at`,
    [user.household_id, user.id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    icon: r.icon as string,
    targetCents: num(r.target_cents),
    savedCents: Math.max(0, num(r.saved)),
    myContributionCents: num(r.mine),
    scope: r.scope as Goal["scope"],
    isOwner: r.owner_id === user.id,
    deadline: (r.deadline as string | null) ?? null,
  }));
}
