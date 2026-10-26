// Importação de extrato: lê o arquivo, classifica cada linha com as regras da pessoa e
// grava de forma idempotente (a mesma linha nunca entra duas vezes).
import { randomUUID } from "node:crypto";
import { looksLikeTransfer, normalizeMerchant } from "../shared/merchant.js";
import type { ImportResult } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { classifyWith, loadClassifier } from "./classify.js";
import { batch, one, q, query } from "./db.js";
import { NO_ACCOUNT } from "./finance.js";
import { HttpError } from "./http.js";
import { ImportError, parseStatement } from "./importers.js";

export async function importStatement(
  user: SessionUser,
  input: { accountId: string; fileName: string; content: string; invertSigns: boolean; commit: boolean },
): Promise<ImportResult> {
  const account = await one<{ id: string; kind: string }>(
    `SELECT id, kind FROM financial_accounts WHERE id = $1 AND profile_id = $2`,
    [input.accountId, user.id],
  );
  if (!account) throw new HttpError(404, "Conta não encontrada");

  let parsed: ReturnType<typeof parseStatement>;
  try {
    parsed = parseStatement(input.fileName, input.content);
  } catch (error) {
    if (error instanceof ImportError) {
      if (input.commit) await logRun(user, input, "csv", "failed", 0, 0, 0, error.message);
      throw new HttpError(400, error.message);
    }
    throw error;
  }
  if (parsed.rows.length > 3000) throw new HttpError(400, "Arquivo com mais de 3.000 linhas. Divida por período.");

  const existing = new Set(
    (
      await query<{ external_id: string }>(
        `SELECT external_id FROM transactions
          WHERE profile_id = $1 AND coalesce(account_id, $2::uuid) = $3 AND external_id = ANY($4::text[])`,
        [user.id, NO_ACCOUNT, account.id, parsed.rows.map((r) => r.externalId)],
      )
    ).map((r) => r.external_id),
  );

  // Fatura de cartão em CSV costuma trazer compras positivas: a pessoa pode inverter.
  const sign = input.invertSigns ? -1 : 1;
  const rows = parsed.rows.map((r) => {
    const signed = r.signedCents * sign;
    return {
      ...r,
      amountCents: Math.abs(signed),
      direction: (signed > 0 ? "income" : "expense") as "income" | "expense",
      // Só para a prévia: pagamento de fatura e transferências próprias não contam como gasto
      shownDirection: looksLikeTransfer(r.description) ? "transfer" : signed > 0 ? "income" : "expense",
      duplicate: existing.has(r.externalId),
    };
  });

  const fresh = rows.filter((r) => !r.duplicate);
  let imported = 0;
  if (input.commit && fresh.length) {
    const classifier = await loadClassifier(user.id);
    const records = fresh.map((r) => {
      const merchant = normalizeMerchant(r.description);
      const c = classifyWith(classifier, { description: r.description, merchant, direction: r.direction });
      return {
        id: randomUUID(),
        occurred_on: r.occurredOn,
        description: r.description,
        merchant,
        amount_cents: r.amountCents,
        direction: c.direction,
        status: c.status,
        classified_by: c.classifiedBy,
        external_id: r.externalId,
        category_id: c.allocation?.categoryId ?? null,
        scope: c.allocation?.scope ?? null,
      };
    });
    const [inserted] = await batch([
      q(
        `WITH rows AS (
           SELECT * FROM json_to_recordset($2::json) AS x(id uuid, occurred_on date, description text, merchant text,
                  amount_cents bigint, direction text, status text, classified_by text, external_id text,
                  category_id text, scope text)
         ),
         ins AS (
           INSERT INTO transactions (id, profile_id, account_id, occurred_on, description, merchant, amount_cents,
                                     direction, status, classified_by, source, external_id)
           SELECT id, $1, $3, occurred_on, description, merchant, amount_cents, direction, status, classified_by, $4, external_id
             FROM rows
           ON CONFLICT (profile_id, (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)), external_id)
             WHERE external_id IS NOT NULL DO NOTHING
           RETURNING id
         ),
         alloc AS (
           INSERT INTO transaction_allocations (transaction_id, profile_id, category_id, amount_cents, scope)
           SELECT r.id, $1, r.category_id, r.amount_cents, r.scope FROM rows r JOIN ins ON ins.id = r.id
            WHERE r.category_id IS NOT NULL
         )
         SELECT count(*)::int AS n FROM ins`,
        [user.id, JSON.stringify(records), account.id, parsed.format],
      ),
      q(`UPDATE financial_accounts SET last_synced_at = now() WHERE id = $1`, [account.id]),
    ]);
    imported = Number(inserted[0]?.n ?? 0);
    await logRun(user, input, parsed.format, "success", rows.length, imported, rows.length - imported, null);
  }

  return {
    format: parsed.format,
    rows: rows.slice(0, 200).map((r) => ({
      occurredOn: r.occurredOn,
      description: r.description,
      amountCents: r.amountCents,
      direction: r.shownDirection as "income" | "expense" | "transfer",
      duplicate: r.duplicate,
    })),
    total: rows.length,
    duplicates: rows.filter((r) => r.duplicate).length,
    imported,
    committed: input.commit,
  };
}

async function logRun(
  user: SessionUser,
  input: { accountId: string; fileName: string },
  format: string,
  status: "success" | "failed",
  total: number,
  imported: number,
  duplicated: number,
  error: string | null,
) {
  await query(
    `INSERT INTO import_runs (profile_id, account_id, format, file_name, status, rows_total, rows_imported, rows_duplicated, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [user.id, input.accountId, format, input.fileName.slice(0, 120), status, total, imported, duplicated, error],
  );
}
