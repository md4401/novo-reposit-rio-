// Fotos das notas fiscais: comprimidas no aparelho e guardadas no banco, visíveis só para o dono.
import { HttpError } from "./http.js";
import type { SessionUser } from "./auth.js";
import { one, query } from "./db.js";

const MAX_BYTES = 700 * 1024;
const MAX_PER_PERSON = 300;

export async function saveReceipt(user: SessionUser, dataUrl: string, transactionId: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, "Imagem inválida");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "Foto grande demais");
  const tx = await one(`SELECT 1 FROM transactions WHERE id = $1 AND profile_id = $2`, [transactionId, user.id]);
  if (!tx) throw new HttpError(404, "Transação não encontrada");
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM receipts WHERE profile_id = $1`, [user.id]);
  if ((count?.n ?? 0) >= MAX_PER_PERSON) throw new HttpError(400, `Limite de ${MAX_PER_PERSON} notas guardadas. Apague algumas antigas.`);
  const row = await one<{ id: string }>(
    `INSERT INTO receipts (profile_id, transaction_id, mime, image, size_bytes) VALUES ($1, $2, $3, decode($4, 'base64'), $5) RETURNING id`,
    [user.id, transactionId, match[1], match[2], bytes.length],
  );
  return row!.id;
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
