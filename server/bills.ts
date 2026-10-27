// Contas da casa divididas (luz, internet, aluguel…). A conta e as partes são visíveis para a
// família de propósito; as compras pessoais de cada um continuam privadas.
import { randomUUID } from "node:crypto";
import { CATEGORY_BY_ID } from "../shared/categories.js";
import { addMonths, daysInMonth, monthRange } from "../shared/time.js";
import type { HouseBill } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { insertTransaction } from "./finance.js";
import { HttpError } from "./http.js";

export async function listBills(user: SessionUser, month: string): Promise<HouseBill[]> {
  const { start, end } = monthRange(month);
  const rows = await query(
    `SELECT b.id, b.name, b.category_id, b.amount_cents, b.due_on::text AS due_on, b.created_by,
            json_agg(json_build_object('profileId', s.profile_id, 'name', p.name, 'amountCents', s.amount_cents,
                                       'paid', s.paid_at IS NOT NULL) ORDER BY p.created_at) AS shares
       FROM house_bills b
       JOIN house_bill_shares s ON s.bill_id = b.id
       JOIN profiles p ON p.id = s.profile_id
      WHERE b.household_id = $1 AND b.due_on >= $2 AND b.due_on < $3
      GROUP BY b.id ORDER BY b.due_on, b.created_at`,
    [user.household_id, start, end],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    categoryId: r.category_id as string,
    amountCents: num(r.amount_cents),
    dueOn: r.due_on as string,
    shares: (r.shares as HouseBill["shares"]).map((s) => ({ ...s, amountCents: num(s.amountCents), isMe: s.profileId === user.id })),
    canDelete: r.created_by === user.id || user.role === "admin",
  }));
}

export async function createBill(
  user: SessionUser,
  input: { name: string; categoryId: string; amountCents: number; dueOn: string; shares: { profileId: string; amountCents: number }[] },
) {
  if (CATEGORY_BY_ID.get(input.categoryId)?.kind !== "expense") throw new HttpError(400, "Categoria inválida");
  if (!input.shares.length) throw new HttpError(400, "Escolha quem divide a conta");
  if (new Set(input.shares.map((s) => s.profileId)).size !== input.shares.length) throw new HttpError(400, "Pessoa repetida na divisão");
  const total = input.shares.reduce((sum, s) => sum + s.amountCents, 0);
  if (input.shares.some((s) => !Number.isInteger(s.amountCents) || s.amountCents <= 0) || total !== input.amountCents)
    throw new HttpError(400, "As partes precisam somar exatamente o valor da conta");
  const members = await query<{ id: string }>(
    `SELECT id FROM profiles WHERE household_id = $1 AND NOT is_demo AND id = ANY($2::uuid[])`,
    [user.household_id, input.shares.map((s) => s.profileId)],
  );
  if (members.length !== input.shares.length) throw new HttpError(400, "Só pessoas da família podem dividir a conta");
  const id = randomUUID();
  await batch([
    q(
      `INSERT INTO house_bills (id, household_id, created_by, name, category_id, amount_cents, due_on) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, user.household_id, user.id, input.name, input.categoryId, input.amountCents, input.dueOn],
    ),
    q(
      `INSERT INTO house_bill_shares (bill_id, profile_id, amount_cents)
       SELECT $1, x.profile_id, x.amount_cents FROM json_to_recordset($2::json) AS x(profile_id uuid, amount_cents bigint)`,
      [id, JSON.stringify(input.shares.map((s) => ({ profile_id: s.profileId, amount_cents: s.amountCents })))],
    ),
  ]);
  return id;
}

async function billOf(user: SessionUser, billId: string) {
  const bill = await one<{ id: string; name: string; category_id: string; due_on: string; created_by: string | null }>(
    `SELECT id, name, category_id, due_on::text AS due_on, created_by FROM house_bills WHERE id = $1 AND household_id = $2`,
    [billId, user.household_id],
  );
  if (!bill) throw new HttpError(404, "Conta não encontrada");
  return bill;
}

/** Marca a minha parte como paga e, se quiser, lança a parte no meu financeiro (como familiar). */
export async function payShare(user: SessionUser, billId: string, createTransaction: boolean) {
  const bill = await billOf(user, billId);
  const share = await one<{ amount_cents: string; paid_at: string | null }>(
    `SELECT amount_cents, paid_at FROM house_bill_shares WHERE bill_id = $1 AND profile_id = $2`,
    [billId, user.id],
  );
  if (!share) throw new HttpError(404, "Você não participa desta conta");
  if (share.paid_at) return;
  const amountCents = num(share.amount_cents);
  const txId = createTransaction
    ? await insertTransaction(user, {
        description: `${bill.name} (minha parte)`,
        amountCents,
        direction: "expense",
        occurredOn: bill.due_on,
        accountId: null,
        method: null,
        source: "manual",
        status: "confirmed",
        classifiedBy: "user",
        allocations: [{ categoryId: bill.category_id, amountCents, scope: "family" }],
      })
    : null;
  await query(`UPDATE house_bill_shares SET paid_at = now(), transaction_id = $3 WHERE bill_id = $1 AND profile_id = $2`, [
    billId,
    user.id,
    txId,
  ]);
}

export async function unpayShare(user: SessionUser, billId: string) {
  await billOf(user, billId);
  const share = await one<{ transaction_id: string | null }>(
    `SELECT transaction_id FROM house_bill_shares WHERE bill_id = $1 AND profile_id = $2`,
    [billId, user.id],
  );
  if (!share) throw new HttpError(404, "Você não participa desta conta");
  const queries = [q(`UPDATE house_bill_shares SET paid_at = NULL, transaction_id = NULL WHERE bill_id = $1 AND profile_id = $2`, [billId, user.id])];
  // O lançamento automático da parte sai junto (só o meu)
  if (share.transaction_id)
    queries.push(q(`DELETE FROM transactions WHERE id = $1 AND profile_id = $2 AND source = 'manual'`, [share.transaction_id, user.id]));
  await batch(queries);
}

export async function deleteBill(user: SessionUser, billId: string) {
  const bill = await billOf(user, billId);
  if (bill.created_by !== user.id && user.role !== "admin") throw new HttpError(403, "Só quem criou a conta (ou administra a família) pode apagá-la");
  await query(`DELETE FROM house_bills WHERE id = $1`, [billId]);
}

/** Copia a conta (com as mesmas partes) para o mês seguinte. */
export async function duplicateBill(user: SessionUser, billId: string) {
  const bill = await billOf(user, billId);
  const shares = await query<{ profile_id: string; amount_cents: string }>(
    `SELECT s.profile_id, s.amount_cents FROM house_bill_shares s JOIN profiles p ON p.id = s.profile_id
      WHERE s.bill_id = $1 AND p.household_id = $2`,
    [billId, user.household_id],
  );
  const amount = shares.reduce((sum, s) => sum + num(s.amount_cents), 0);
  const month = addMonths(bill.due_on.slice(0, 7), 1);
  const day = Math.min(Number(bill.due_on.slice(8, 10)), daysInMonth(month));
  return createBill(user, {
    name: bill.name,
    categoryId: bill.category_id,
    amountCents: amount,
    dueOn: `${month}-${String(day).padStart(2, "0")}`,
    shares: shares.map((s) => ({ profileId: s.profile_id, amountCents: num(s.amount_cents) })),
  });
}
