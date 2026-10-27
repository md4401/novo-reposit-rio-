// Etiquetas, Imposto de Renda, patrimônio e dívidas — tudo só da própria pessoa.
import { payoffPlan } from "../shared/planning.js";
import type { Asset, Debt, DebtPlan, Tag, TaxItem, TaxReport, Wealth } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { accountBalances } from "./finance.js";
import { HttpError } from "./http.js";
import { cardInvoices } from "./planning.js";

// ---------------------------------------------------------------------------
// Etiquetas

export async function listTags(user: SessionUser): Promise<Tag[]> {
  const rows = await query(
    `SELECT tg.id, tg.name, tg.color, count(t.id)::int AS n,
            coalesce(sum(t.amount_cents) FILTER (WHERE t.direction = 'expense' AND NOT t.ignored), 0) AS total
       FROM tags tg LEFT JOIN transaction_tags tt ON tt.tag_id = tg.id LEFT JOIN transactions t ON t.id = tt.transaction_id
      WHERE tg.profile_id = $1 GROUP BY tg.id ORDER BY lower(tg.name)`,
    [user.id],
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, color: r.color as string, count: num(r.n), totalCents: num(r.total) }));
}

export async function createTag(user: SessionUser, name: string, color: string) {
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM tags WHERE profile_id = $1`, [user.id]);
  if ((count?.n ?? 0) >= 100) throw new HttpError(400, "Limite de 100 etiquetas");
  try {
    await query(`INSERT INTO tags (profile_id, name, color) VALUES ($1, $2, $3)`, [user.id, name, color]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "Você já tem uma etiqueta com esse nome");
    throw error;
  }
}

export async function deleteTag(user: SessionUser, id: string) {
  await query(`DELETE FROM tags WHERE id = $1 AND profile_id = $2`, [id, user.id]);
}

/** Troca as etiquetas de um lançamento (só etiquetas e lançamentos da própria pessoa). */
export async function setTransactionTags(user: SessionUser, transactionId: string, tagIds: string[]) {
  const unique = [...new Set(tagIds)].slice(0, 10);
  if (unique.length) {
    const mine = await query(`SELECT id FROM tags WHERE profile_id = $1 AND id = ANY($2::uuid[])`, [user.id, unique]);
    if (mine.length !== unique.length) throw new HttpError(404, "Etiqueta não encontrada");
  }
  await batch([
    q(`DELETE FROM transaction_tags WHERE transaction_id = $1 AND EXISTS (SELECT 1 FROM transactions WHERE id = $1 AND profile_id = $2)`, [transactionId, user.id]),
    q(
      `INSERT INTO transaction_tags (transaction_id, tag_id)
       SELECT $1, x FROM unnest($3::uuid[]) AS x WHERE EXISTS (SELECT 1 FROM transactions WHERE id = $1 AND profile_id = $2)`,
      [transactionId, user.id, unique],
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Imposto de Renda (despesas dedutíveis: saúde e educação; a pessoa pode marcar outras ou desmarcar)

/** Limite anual de dedução com instrução por pessoa na declaração (referência; confira as regras do ano). */
export const EDUCATION_LIMIT_CENTS = 356150;

export async function taxReport(user: SessionUser, year: number): Promise<TaxReport> {
  const rows = await query(
    `SELECT t.id, t.occurred_on::text AS occurred_on, t.description, t.tax_deductible,
            a.category_id, a.amount_cents AS part, t.amount_cents AS total
       FROM transactions t LEFT JOIN transaction_allocations a ON a.transaction_id = t.id
      WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored
        AND t.occurred_on >= $2 AND t.occurred_on < $3
        AND (t.tax_deductible IS TRUE OR (t.tax_deductible IS NULL AND a.category_id IN ('saude', 'educacao')))
      ORDER BY t.occurred_on, t.id`,
    [user.id, `${year}-01-01`, `${year + 1}-01-01`],
  );
  const items: TaxItem[] = [];
  const seenWhole = new Set<string>();
  for (const r of rows) {
    const category = r.category_id as string | null;
    if (category === "saude" || category === "educacao") {
      items.push({ transactionId: r.id as string, occurredOn: r.occurred_on as string, description: r.description as string, amountCents: num(r.part), kind: category, overridden: r.tax_deductible === true });
    } else if (r.tax_deductible === true && !seenWhole.has(r.id as string)) {
      // Marcado à mão: entra o valor das partes que não são saúde/educação
      const others = rows.filter((x) => x.id === r.id && x.category_id !== "saude" && x.category_id !== "educacao").reduce((s, x) => s + num(x.part ?? x.total), 0);
      seenWhole.add(r.id as string);
      items.push({ transactionId: r.id as string, occurredOn: r.occurred_on as string, description: r.description as string, amountCents: others, kind: "outros", overridden: true });
    }
  }
  const totals = { saude: 0, educacao: 0, outros: 0 };
  for (const i of items) totals[i.kind] += i.amountCents;
  return { year, items, totals, educationLimitCents: EDUCATION_LIMIT_CENTS };
}

// ---------------------------------------------------------------------------
// Patrimônio e dívidas

const mapAsset = (r: Record<string, unknown>): Asset => ({
  id: r.id as string,
  name: r.name as string,
  kind: r.kind as Asset["kind"],
  valueCents: num(r.value_cents),
  updatedOn: r.updated_on as string,
  isReserve: Boolean(r.is_reserve),
});
const mapDebt = (r: Record<string, unknown>): Debt => ({
  id: r.id as string,
  name: r.name as string,
  balanceCents: num(r.balance_cents),
  monthlyRatePercent: num(r.monthly_rate_bp) / 100,
  minPaymentCents: num(r.min_payment_cents),
});

export async function loadWealth(user: SessionUser, today: string): Promise<Wealth> {
  const [balances, invoices, lists] = await Promise.all([
    accountBalances(user, today),
    cardInvoices(user, today),
    batch(
      [
        q(`SELECT id, name, kind, value_cents, updated_on::text AS updated_on FROM assets WHERE profile_id = $1 ORDER BY value_cents DESC, id`, [user.id]),
        q(`SELECT id, name, balance_cents, monthly_rate_bp, min_payment_cents FROM debts WHERE profile_id = $1 ORDER BY balance_cents DESC, id`, [user.id]),
        q(`SELECT id, kind FROM financial_accounts WHERE profile_id = $1 AND active`, [user.id]),
      ],
      { readOnly: true },
    ),
  ]);
  const [assetRows, debtRows, accounts] = lists;
  let accountsCents = 0;
  for (const a of accounts) {
    const b = balances.get(a.id as string);
    if (a.kind !== "credit_card" && b?.currentBalanceCents !== null && b?.currentBalanceCents !== undefined) accountsCents += b.currentBalanceCents;
  }
  // Cartão: o que já foi gasto e ainda não foi pago (faturas fechadas e a aberta)
  const cardsCents = invoices.filter((i) => i.status !== "future").reduce((s, i) => s + i.totalCents, 0);
  const assets = assetRows.map(mapAsset);
  const debts = debtRows.map(mapDebt);
  const assetsCents = accountsCents + assets.reduce((s, a) => s + a.valueCents, 0);
  const debtsCents = cardsCents + debts.reduce((s, d) => s + d.balanceCents, 0);
  const month = today.slice(0, 7);
  // Guarda a foto do mês para mostrar a evolução
  await query(
    `INSERT INTO net_worth_snapshots (profile_id, month, assets_cents, debts_cents) VALUES ($1, $2, $3, $4)
     ON CONFLICT (profile_id, month) DO UPDATE SET assets_cents = $3, debts_cents = $4`,
    [user.id, month, assetsCents, debtsCents],
  );
  const history = await query(
    `SELECT month, assets_cents - debts_cents AS net FROM net_worth_snapshots WHERE profile_id = $1 ORDER BY month DESC LIMIT 12`,
    [user.id],
  );
  return {
    accountsCents,
    assets,
    debts,
    cardsCents,
    assetsCents,
    debtsCents,
    netWorthCents: assetsCents - debtsCents,
    history: history.reverse().map((h) => ({ month: h.month as string, netWorthCents: num(h.net) })),
  };
}

export async function saveAsset(user: SessionUser, input: Omit<Asset, "id">, id?: string) {
  if (id) {
    const row = await one(
      `UPDATE assets SET name = $3, kind = $4, value_cents = $5, updated_on = $6 WHERE id = $1 AND profile_id = $2 RETURNING id`,
      [id, user.id, input.name, input.kind, input.valueCents, input.updatedOn],
    );
    if (!row) throw new HttpError(404, "Bem não encontrado");
  } else {
    await query(`INSERT INTO assets (profile_id, name, kind, value_cents, updated_on) VALUES ($1, $2, $3, $4, $5)`, [
      user.id,
      input.name,
      input.kind,
      input.valueCents,
      input.updatedOn,
    ]);
  }
}

export async function saveDebt(user: SessionUser, input: Omit<Debt, "id">, id?: string) {
  const bp = Math.round(input.monthlyRatePercent * 100);
  if (id) {
    const row = await one(
      `UPDATE debts SET name = $3, balance_cents = $4, monthly_rate_bp = $5, min_payment_cents = $6, updated_at = now()
        WHERE id = $1 AND profile_id = $2 RETURNING id`,
      [id, user.id, input.name, input.balanceCents, bp, input.minPaymentCents],
    );
    if (!row) throw new HttpError(404, "Dívida não encontrada");
  } else {
    await query(`INSERT INTO debts (profile_id, name, balance_cents, monthly_rate_bp, min_payment_cents) VALUES ($1, $2, $3, $4, $5)`, [
      user.id,
      input.name,
      input.balanceCents,
      bp,
      input.minPaymentCents,
    ]);
  }
}

export async function deleteWealthItem(user: SessionUser, table: "assets" | "debts", id: string) {
  await query(`DELETE FROM ${table === "assets" ? "assets" : "debts"} WHERE id = $1 AND profile_id = $2`, [id, user.id]);
}

export async function debtPlan(user: SessionUser, extraCents: number): Promise<DebtPlan> {
  const rows = await query(`SELECT id, name, balance_cents, monthly_rate_bp, min_payment_cents FROM debts WHERE profile_id = $1`, [user.id]);
  const debts = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    balanceCents: num(r.balance_cents),
    monthlyRateBp: num(r.monthly_rate_bp),
    minPaymentCents: num(r.min_payment_cents),
  }));
  const pick = (strategy: "snowball" | "avalanche") => {
    const p = payoffPlan(debts, extraCents, strategy);
    return { months: p.months, interestCents: p.interestCents, feasible: p.feasible, order: p.order };
  };
  return { extraCents, snowball: pick("snowball"), avalanche: pick("avalanche") };
}
