// Planejamento: base do simulador de grandes momentos, teto de parcelas e lista de compras da família.
import { productKey } from "../shared/basket.js";
import { formatMoney } from "../shared/money.js";
import { addMonths } from "../shared/time.js";
import type { Insight, PlanBase, ShoppingList } from "../shared/types.js";
import { loadAlerts } from "./alerts.js";
import type { SessionUser } from "./auth.js";
import { num, one, query } from "./db.js";
import { HttpError } from "./http.js";

export async function planBase(user: SessionUser, today: string): Promise<PlanBase> {
  const month = today.slice(0, 7);
  const [row, alerts] = await Promise.all([
    one<{ income: string; expense: string }>(
      `SELECT coalesce(sum(amount_cents) FILTER (WHERE direction = 'income'), 0) AS income,
              coalesce(sum(amount_cents) FILTER (WHERE direction = 'expense'), 0) AS expense
         FROM transactions WHERE profile_id = $1 AND NOT ignored AND occurred_on >= $2::date AND occurred_on < $3::date`,
      [user.id, `${addMonths(month, -3)}-01`, `${month}-01`],
    ),
    loadAlerts(user),
  ]);
  const incomeCents = Math.round(num(row?.income) / 3);
  const installmentsCents = alerts.commitments.items.filter((i) => i.kind === "parcela").reduce((s, i) => s + i.amountCents, 0);
  return {
    incomeCents,
    expenseCents: Math.round(num(row?.expense) / 3),
    installmentsCents,
    installmentsRatio: incomeCents > 0 ? installmentsCents / incomeCents : 0,
  };
}

export async function planInsights(user: SessionUser, today: string): Promise<Insight[]> {
  const base = await planBase(user, today);
  if (base.incomeCents <= 0 || base.installmentsRatio < 0.3) return [];
  return [
    {
      id: "installments-ceiling",
      icon: "🧮",
      title: `Parcelas já comem ${Math.round(base.installmentsRatio * 100)}% da renda`,
      text: `${formatMoney(base.installmentsCents)} em parcelas no mês que vem. Acima de 30% aperta: evite parcelar mais até baixar.`,
      page: "simuladores?aba=parcelar",
    },
  ];
}

// ---------------------------------------------------------------------------
// Lista de compras da família (com preço previsto pela cesta)

export async function shoppingList(user: SessionUser): Promise<ShoppingList> {
  const rows = await query(
    `SELECT s.id, s.name, s.quantity, s.checked, p.name AS added_by,
            (SELECT round(avg(ri.amount_cents))::bigint FROM receipt_items ri JOIN profiles rp ON rp.id = ri.profile_id
              WHERE rp.household_id = s.household_id AND ri.product_key = s.product_key
                AND ri.occurred_on >= current_date - 120) AS estimate
       FROM shopping_items s LEFT JOIN profiles p ON p.id = s.added_by
      WHERE s.household_id = $1
      ORDER BY s.checked, s.created_at`,
    [user.household_id],
  );
  const items = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    quantity: num(r.quantity),
    checked: Boolean(r.checked),
    addedBy: (r.added_by as string | null) ?? null,
    estimateCents: r.estimate === null ? null : num(r.estimate) * num(r.quantity),
  }));
  const open = items.filter((i) => !i.checked);
  return {
    items,
    estimateCents: open.reduce((s, i) => s + (i.estimateCents ?? 0), 0),
    unknownCount: open.filter((i) => i.estimateCents === null).length,
  };
}

export async function addShoppingItem(user: SessionUser, name: string, quantity: number) {
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM shopping_items WHERE household_id = $1`, [user.household_id]);
  if ((count?.n ?? 0) >= 200) throw new HttpError(400, "A lista já tem 200 itens. Tire os comprados.");
  const key = productKey(name);
  // Mesmo produto ainda não comprado: só soma a quantidade
  const existing = await one<{ id: string }>(
    `UPDATE shopping_items SET quantity = least(99, quantity + $3) WHERE household_id = $1 AND product_key = $2 AND NOT checked RETURNING id`,
    [user.household_id, key, quantity],
  );
  if (existing) return;
  await query(`INSERT INTO shopping_items (household_id, name, product_key, quantity, added_by) VALUES ($1, $2, $3, $4, $5)`, [
    user.household_id,
    name,
    key,
    quantity,
    user.id,
  ]);
}

export async function updateShoppingItem(user: SessionUser, id: string, patch: { checked?: boolean; quantity?: number }) {
  const row = await one(
    `UPDATE shopping_items SET checked = coalesce($3, checked), quantity = coalesce($4, quantity) WHERE id = $1 AND household_id = $2 RETURNING id`,
    [id, user.household_id, patch.checked ?? null, patch.quantity ?? null],
  );
  if (!row) throw new HttpError(404, "Item não encontrado");
}

export async function deleteShoppingItem(user: SessionUser, id: string) {
  const row = await one(`DELETE FROM shopping_items WHERE id = $1 AND household_id = $2 RETURNING id`, [id, user.household_id]);
  if (!row) throw new HttpError(404, "Item não encontrado");
}

export async function clearChecked(user: SessionUser) {
  await query(`DELETE FROM shopping_items WHERE household_id = $1 AND checked`, [user.household_id]);
}
