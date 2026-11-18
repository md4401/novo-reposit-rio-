// Notas fiscais: a foto (comprimida no aparelho) e o que foi lido dela ficam guardados no banco,
// num arquivo só da pessoa. A nota pode ficar sozinha ou ligada à compra que ela comprova.
import { CATEGORY_BY_ID } from "../shared/categories.js";
import type { ReceiptItem, StoredReceipt } from "../shared/types.js";
import { HttpError } from "./http.js";
import type { SessionUser } from "./auth.js";
import { num, one, query } from "./db.js";

const MAX_BYTES = 700 * 1024;
export const MAX_RECEIPTS = 500;

export type ReceiptInfo = { merchant?: string | null; totalCents?: number | null; issuedOn?: string | null; items?: ReceiptItem[] };

/** Itens lidos da nota, limpos: nome curto, valor inteiro positivo, categoria de gasto válida. */
export function cleanItems(value: unknown): ReceiptItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i) => i && typeof i.name === "string" && i.name.trim() && Number.isInteger(i.amountCents) && i.amountCents > 0)
    .slice(0, 80)
    .map((i) => ({
      name: String(i.name).trim().slice(0, 80),
      amountCents: Number(i.amountCents),
      categoryId: CATEGORY_BY_ID.get(i.categoryId)?.kind === "expense" ? String(i.categoryId) : "outros",
    }));
}

async function ownTransaction(user: SessionUser, transactionId: string) {
  const tx = await one(`SELECT 1 FROM transactions WHERE id = $1 AND profile_id = $2`, [transactionId, user.id]);
  if (!tx) throw new HttpError(404, "Transação não encontrada");
}

export async function saveReceipt(user: SessionUser, dataUrl: string, transactionId: string | null, info: ReceiptInfo = {}) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, "Imagem inválida");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "Foto grande demais");
  if (transactionId) await ownTransaction(user, transactionId);
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM receipts WHERE profile_id = $1`, [user.id]);
  if ((count?.n ?? 0) >= MAX_RECEIPTS) throw new HttpError(400, `Limite de ${MAX_RECEIPTS} notas guardadas. Apague algumas antigas em Notas fiscais.`);
  const row = await one<{ id: string }>(
    `INSERT INTO receipts (profile_id, transaction_id, mime, image, size_bytes, merchant, total_cents, issued_on, items)
     VALUES ($1, $2, $3, decode($4, 'base64'), $5, $6, $7, $8, $9::jsonb) RETURNING id`,
    [
      user.id,
      transactionId,
      match[1],
      match[2],
      bytes.length,
      info.merchant?.trim().slice(0, 80) || null,
      info.totalCents ?? null,
      info.issuedOn ?? null,
      JSON.stringify(info.items ?? []),
    ],
  );
  return row!.id;
}

/** Arquivo de notas, da mais nova para a mais antiga (sem a foto: ela vem por receipts/:id). */
export async function listReceipts(user: SessionUser): Promise<StoredReceipt[]> {
  const rows = await query(
    `SELECT r.id, r.merchant, r.total_cents, r.issued_on::text AS issued_on, r.items, r.size_bytes, r.created_at,
            r.transaction_id, t.description AS tx_description, t.amount_cents AS tx_amount, t.occurred_on::text AS tx_date
       FROM receipts r LEFT JOIN transactions t ON t.id = r.transaction_id AND t.profile_id = r.profile_id
      WHERE r.profile_id = $1
      ORDER BY coalesce(r.issued_on, r.created_at::date) DESC, r.created_at DESC`,
    [user.id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    merchant: (r.merchant as string | null) ?? null,
    totalCents: r.total_cents == null ? null : num(r.total_cents),
    issuedOn: (r.issued_on as string | null) ?? null,
    items: (r.items as ReceiptItem[]) ?? [],
    sizeBytes: Number(r.size_bytes),
    createdAt: new Date(r.created_at as string).toISOString(),
    transaction: r.transaction_id
      ? { id: r.transaction_id as string, description: r.tx_description as string, amountCents: num(r.tx_amount), occurredOn: r.tx_date as string }
      : null,
  }));
}

/** Liga (ou desliga, com null) a nota a uma compra e corrige loja, data e total. */
export async function updateReceipt(user: SessionUser, id: string, change: ReceiptInfo & { transactionId?: string | null }) {
  const current = await one(`SELECT 1 FROM receipts WHERE id = $1 AND profile_id = $2`, [id, user.id]);
  if (!current) throw new HttpError(404, "Nota não encontrada");
  if (change.transactionId) await ownTransaction(user, change.transactionId);
  await query(
    `UPDATE receipts SET
        transaction_id = CASE WHEN $3 THEN $4::uuid ELSE transaction_id END,
        merchant = CASE WHEN $5 THEN $6 ELSE merchant END,
        total_cents = CASE WHEN $7 THEN $8::bigint ELSE total_cents END,
        issued_on = CASE WHEN $9 THEN $10::date ELSE issued_on END
      WHERE id = $1 AND profile_id = $2`,
    [
      id,
      user.id,
      change.transactionId !== undefined,
      change.transactionId ?? null,
      change.merchant !== undefined,
      change.merchant?.trim().slice(0, 80) || null,
      change.totalCents !== undefined,
      change.totalCents ?? null,
      change.issuedOn !== undefined,
      change.issuedOn ?? null,
    ],
  );
}

export async function receiptImage(user: SessionUser, id: string) {
  const row = await one<{ mime: string; image: string }>(
    `SELECT mime, encode(image, 'base64') AS image FROM receipts WHERE id = $1 AND profile_id = $2`,
    [id, user.id],
  );
  if (!row) throw new HttpError(404, "Nota não encontrada");
  return { mime: row.mime, bytes: Buffer.from(row.image, "base64") };
}

export async function deleteReceipt(user: SessionUser, id: string) {
  await query(`DELETE FROM receipts WHERE id = $1 AND profile_id = $2`, [id, user.id]);
}
