// Importação de extrato: lê o arquivo, classifica cada linha com as regras da pessoa e
// grava de forma idempotente (a mesma linha nunca entra duas vezes).
import { randomUUID } from "node:crypto";
import { looksLikeTransfer, normalizeMerchant } from "../shared/merchant.js";
import type { ImportResult } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { aiEnabled, classifyManyWithAi } from "./ai.js";
import { classifyWith, loadClassifier } from "./classify.js";
import { batch, one, q, query } from "./db.js";
import { applyGoalRules, NO_ACCOUNT } from "./finance.js";
import { HttpError, logError } from "./http.js";
import { daysBetween } from "../shared/time.js";
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

  // Fatura de cartão em CSV costuma trazer compras positivas: o banco reconhecido decide;
  // nos outros, a pessoa pode inverter.
  const invert = parsed.bank ? parsed.bank.creditCard : input.invertSigns;
  const sign = invert ? -1 : 1;
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

  // Compras já capturadas pela notificação do banco: o extrato só completa (não duplica)
  const captured = await query<{ id: string; amount_cents: string; direction: string; occurred_on: string }>(
    `SELECT id, amount_cents, direction, occurred_on::text AS occurred_on FROM transactions
      WHERE profile_id = $1 AND source = 'notification' AND external_id IS NULL AND NOT ignored
        AND occurred_on BETWEEN $2::date - 3 AND $3::date + 3`,
    [user.id, rows.reduce((m, r) => (r.occurredOn < m ? r.occurredOn : m), "9999-12-31"), rows.reduce((m, r) => (r.occurredOn > m ? r.occurredOn : m), "0000-01-01")],
  );
  const used = new Set<string>();
  const matches = new Map<string, string>();
  for (const r of rows) {
    if (r.duplicate) continue;
    const hit = captured.find(
      (c) => !used.has(c.id) && Number(c.amount_cents) === r.amountCents && c.direction === r.direction && Math.abs(daysBetween(c.occurred_on, r.occurredOn)) <= 3,
    );
    if (hit) {
      used.add(hit.id);
      matches.set(r.externalId, hit.id);
    }
  }
  const fresh = rows.filter((r) => !r.duplicate && !matches.has(r.externalId));
  let imported = 0;
  let pending = 0;
  if (input.commit && (fresh.length || matches.size)) {
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
        inflow: r.signedCents * sign > 0,
        category_id: c.allocation?.categoryId ?? null,
        scope: c.allocation?.scope ?? null,
      };
    });
    // O que regras, histórico e palavras-chave não resolveram vai para a IA (uma chamada só).
    if (aiEnabled()) {
      const unknown = [...new Set(records.filter((r) => r.status === "pending" && r.direction === "expense").map((r) => r.description))].slice(0, 60);
      try {
        const guesses = await classifyManyWithAi(unknown);
        for (const r of records) {
          const g = guesses.get(r.description);
          if (r.status === "pending" && g && g.confidence >= 0.75) {
            Object.assign(r, { status: "auto", classified_by: "ai", category_id: g.categoryId, scope: "personal" });
          }
        }
      } catch (error) {
        logError(error); // IA indisponível: segue sem ela
      }
    }
    const [inserted] = await batch([
      q(
        `WITH rows AS (
           SELECT * FROM json_to_recordset($2::json) AS x(id uuid, occurred_on date, description text, merchant text,
                  amount_cents bigint, direction text, status text, classified_by text, external_id text,
                  inflow boolean, category_id text, scope text)
         ),
         ins AS (
           INSERT INTO transactions (id, profile_id, account_id, occurred_on, description, merchant, amount_cents,
                                     direction, status, classified_by, source, external_id, inflow)
           SELECT id, $1, $3, occurred_on, description, merchant, amount_cents, direction, status, classified_by, $4, external_id, inflow
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
    pending = Math.min(imported, records.filter((r) => r.status === "pending").length);
    if (matches.size) {
      // Liga a captura à linha do extrato: reimportar continua sem duplicar
      await batch(
        [...matches].map(([externalId, id]) =>
          q(`UPDATE transactions SET external_id = $3, account_id = $4, updated_at = now() WHERE id = $1 AND profile_id = $2`, [id, user.id, externalId, account.id]),
        ),
      );
    }
    await applyGoalRules(user.id, records.map((r) => r.id));
    await logRun(user, input, parsed.format, "success", rows.length, imported, rows.length - imported, null);
  }

  return {
    format: parsed.format,
    rows: rows.slice(0, 200).map((r) => ({
      occurredOn: r.occurredOn,
      description: r.description,
      amountCents: r.amountCents,
      direction: r.shownDirection as "income" | "expense" | "transfer",
      duplicate: r.duplicate || matches.has(r.externalId),
    })),
    total: rows.length,
    duplicates: rows.filter((r) => r.duplicate).length + matches.size,
    imported,
    committed: input.commit,
    bank: parsed.bank?.name ?? null,
    autoInverted: Boolean(parsed.bank?.creditCard),
    latestMonth: rows.length ? rows.reduce((m, r) => (r.occurredOn > m ? r.occurredOn : m), "").slice(0, 7) : null,
    pending,
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
