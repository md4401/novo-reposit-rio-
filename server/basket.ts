// Cesta da família: preço dos produtos das notas fiscais ao longo do tempo.
// Só entram notas lançadas como compra da família; o agregado nunca mostra quem comprou nem onde.
import { priceChangeBp, productKey } from "../shared/basket.js";
import { CATEGORY_BY_ID } from "../shared/categories.js";
import type { Basket, BasketProduct } from "../shared/types.js";
import { addMonths, monthOf, todayKey } from "../shared/time.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { HttpError } from "./http.js";

export type BasketItemInput = { name: string; amountCents: number; categoryId: string };

/** Guarda (ou troca) os itens da nota de um lançamento da própria pessoa. */
export async function saveReceiptItems(user: SessionUser, transactionId: string, items: BasketItemInput[]) {
  const tx = await one<{ occurred_on: string; family: boolean }>(
    `SELECT t.occurred_on::text AS occurred_on,
            EXISTS (SELECT 1 FROM transaction_allocations a WHERE a.transaction_id = t.id AND a.scope = 'family') AS family
       FROM transactions t WHERE t.id = $1 AND t.profile_id = $2`,
    [transactionId, user.id],
  );
  if (!tx) throw new HttpError(404, "Lançamento não encontrado");
  const valid = items
    .filter((i) => i && typeof i.name === "string" && i.name.trim() && Number.isInteger(i.amountCents) && i.amountCents > 0)
    .slice(0, 60)
    .map((i) => ({ name: i.name.trim().slice(0, 80), key: productKey(i.name), amountCents: i.amountCents, categoryId: CATEGORY_BY_ID.has(i.categoryId) ? i.categoryId : "outros" }))
    .filter((i) => i.key.length >= 3);
  // Compra pessoal não entra na cesta: os itens ficam de fora de propósito
  const keep = tx.family ? valid : [];
  await batch([
    q(`DELETE FROM receipt_items WHERE transaction_id = $1 AND profile_id = $2`, [transactionId, user.id]),
    ...keep.map((i) =>
      q(
        `INSERT INTO receipt_items (profile_id, transaction_id, name, product_key, category_id, amount_cents, occurred_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, transactionId, i.name, i.key, i.categoryId, i.amountCents, tx.occurred_on],
      ),
    ),
  ]);
  return { saved: keep.length, family: tx.family };
}

export async function loadBasket(user: SessionUser, months = 6): Promise<Basket> {
  const thisMonth = monthOf(todayKey(user.timezone));
  const from = `${addMonths(thisMonth, -(months - 1))}-01`;
  const rows = await query(
    `SELECT i.product_key, to_char(i.occurred_on, 'YYYY-MM') AS month,
            round(avg(i.amount_cents))::bigint AS avg_cents, count(*)::int AS n,
            mode() WITHIN GROUP (ORDER BY i.name) AS name,
            mode() WITHIN GROUP (ORDER BY i.category_id) AS category_id
       FROM receipt_items i JOIN profiles p ON p.id = i.profile_id
      WHERE p.household_id = $1 AND i.occurred_on >= $2::date
      GROUP BY i.product_key, month
      ORDER BY i.product_key, month`,
    [user.household_id, from],
  );
  const receipts = await one<{ n: number }>(
    `SELECT count(DISTINCT i.transaction_id)::int AS n FROM receipt_items i JOIN profiles p ON p.id = i.profile_id
      WHERE p.household_id = $1 AND i.occurred_on >= $2::date`,
    [user.household_id, from],
  );
  const byKey = new Map<string, BasketProduct>();
  for (const r of rows) {
    const key = r.product_key as string;
    const product =
      byKey.get(key) ??
      ({ key, name: r.name as string, categoryId: r.category_id as string, lastCents: 0, changeBp: null, purchases: 0, points: [] } as BasketProduct);
    product.points.push({ month: r.month as string, avgCents: num(r.avg_cents), count: num(r.n) });
    product.purchases += num(r.n);
    byKey.set(key, product);
  }
  const products = [...byKey.values()]
    // Produto comprado uma vez só não tem "evolução" e expõe demais uma compra isolada
    .filter((p) => p.purchases >= 2)
    .map((p) => ({ ...p, lastCents: p.points[p.points.length - 1].avgCents, changeBp: priceChangeBp(p.points) }))
    .sort((a, b) => Math.abs(b.changeBp ?? 0) - Math.abs(a.changeBp ?? 0) || b.purchases - a.purchases)
    .slice(0, 80);
  return { months, products, receipts: receipts?.n ?? 0 };
}
