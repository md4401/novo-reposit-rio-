// Proteção contra imprevistos: reserva de emergência, documentos e garantias, "e se eu faltar?" e golpes.
import { formatMoney } from "../shared/money.js";
import type { DocumentItem, Insight, LegacyMine, LegacyShared, ReserveStatus, ScamAlert } from "../shared/types.js";
import { addDays, addMonths, daysBetween } from "../shared/time.js";
import type { SessionUser } from "./auth.js";
import { batch, num, one, q, query } from "./db.js";
import { accountBalances } from "./finance.js";
import { HttpError } from "./http.js";

// ---------------------------------------------------------------------------
// Reserva de emergência

const ESSENTIAL = ["moradia", "alimentacao", "saude", "transporte", "educacao", "limpeza", "higiene"];

export async function reserveStatus(user: SessionUser, today: string): Promise<ReserveStatus> {
  const month = today.slice(0, 7);
  const [essential, accounts, assets, profile] = await batch(
    [
      // Gasto essencial dos últimos 3 meses completos (todas as partes da própria pessoa)
      q(
        `SELECT coalesce(sum(a.amount_cents), 0) AS cents
           FROM transaction_allocations a JOIN transactions t ON t.id = a.transaction_id
          WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored AND a.category_id = ANY($2)
            AND t.occurred_on >= $3::date AND t.occurred_on < $4::date`,
        [user.id, ESSENTIAL, `${addMonths(month, -3)}-01`, `${month}-01`],
      ),
      q(`SELECT id, name, kind, is_reserve FROM financial_accounts WHERE profile_id = $1 AND active AND kind IN ('checking', 'savings', 'cash', 'other') ORDER BY name`, [user.id]),
      q(`SELECT id, name, value_cents, is_reserve FROM assets WHERE profile_id = $1 AND kind = 'investment' ORDER BY name`, [user.id]),
      q(`SELECT income_mode FROM profiles WHERE id = $1`, [user.id]),
    ],
    { readOnly: true },
  );
  const balances = await accountBalances(user, today);
  const items: ReserveStatus["items"] = [
    ...accounts.map((a) => ({
      kind: "account" as const,
      id: a.id as string,
      name: a.name as string,
      cents: balances.get(a.id as string)?.currentBalanceCents ?? 0,
      isReserve: Boolean(a.is_reserve),
    })),
    ...assets.map((a) => ({ kind: "asset" as const, id: a.id as string, name: a.name as string, cents: num(a.value_cents), isReserve: Boolean(a.is_reserve) })),
  ];
  const essentialCents = Math.round(num(essential[0]?.cents) / 3);
  const reserveCents = items.filter((i) => i.isReserve).reduce((s, i) => s + Math.max(0, i.cents), 0);
  // Renda variável pede um colchão maior
  const targetMonths = profile[0]?.income_mode === "variable" ? 12 : 6;
  return {
    essentialCents,
    reserveCents,
    months: essentialCents > 0 ? Math.round((reserveCents / essentialCents) * 10) / 10 : 0,
    targetMonths,
    targetCents: essentialCents * targetMonths,
    items,
  };
}

export async function setReserveItems(user: SessionUser, accountIds: string[], assetIds: string[]) {
  await batch([
    q(`UPDATE financial_accounts SET is_reserve = (id = ANY($2)) WHERE profile_id = $1`, [user.id, accountIds]),
    q(`UPDATE assets SET is_reserve = (id = ANY($2)) WHERE profile_id = $1`, [user.id, assetIds]),
  ]);
}

// ---------------------------------------------------------------------------
// Documentos e garantias

const MAX_DOC_BYTES = 900 * 1024;

export async function listDocuments(user: SessionUser, today: string): Promise<DocumentItem[]> {
  const rows = await query(
    `SELECT d.id, d.name, d.kind, d.expires_on::text AS expires_on, d.remind_days, d.notes, d.shared,
            d.image IS NOT NULL AS has_image, d.profile_id, p.name AS owner
       FROM documents d JOIN profiles p ON p.id = d.profile_id
      WHERE d.profile_id = $1 OR (d.shared AND p.household_id = $2)
      ORDER BY d.expires_on NULLS LAST, d.created_at DESC`,
    [user.id, user.household_id],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as DocumentItem["kind"],
    expiresOn: (r.expires_on as string | null) ?? null,
    remindDays: num(r.remind_days),
    notes: (r.notes as string | null) ?? null,
    shared: Boolean(r.shared),
    hasImage: Boolean(r.has_image),
    owner: r.owner as string,
    isMine: r.profile_id === user.id,
    daysLeft: r.expires_on ? daysBetween(today, r.expires_on as string) : null,
  }));
}

export type DocumentInput = {
  name: string;
  kind: DocumentItem["kind"];
  expiresOn: string | null;
  remindDays: number;
  notes: string | null;
  shared: boolean;
  image?: string | null;
};

function decodeImage(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, "Imagem inválida");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_DOC_BYTES) throw new HttpError(413, "Foto grande demais");
  return { mime: match[1], base64: match[2], size: bytes.length };
}

export async function saveDocument(user: SessionUser, input: DocumentInput, id?: string) {
  const image = input.image ? decodeImage(input.image) : null;
  if (id) {
    const row = await one(
      `UPDATE documents SET name = $3, kind = $4, expires_on = $5, remind_days = $6, notes = $7, shared = $8
        WHERE id = $1 AND profile_id = $2 RETURNING id`,
      [id, user.id, input.name, input.kind, input.expiresOn, input.remindDays, input.notes, input.shared],
    );
    if (!row) throw new HttpError(404, "Documento não encontrado");
    if (image)
      await query(`UPDATE documents SET mime = $3, image = decode($4, 'base64'), size_bytes = $5 WHERE id = $1 AND profile_id = $2`, [
        id,
        user.id,
        image.mime,
        image.base64,
        image.size,
      ]);
    return;
  }
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM documents WHERE profile_id = $1`, [user.id]);
  if ((count?.n ?? 0) >= 200) throw new HttpError(400, "Limite de 200 documentos");
  await query(
    `INSERT INTO documents (profile_id, name, kind, expires_on, remind_days, notes, shared, mime, image, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, decode($9, 'base64'), $10)`,
    [user.id, input.name, input.kind, input.expiresOn, input.remindDays, input.notes, input.shared, image?.mime ?? null, image?.base64 ?? null, image?.size ?? null],
  );
}

export async function documentImage(user: SessionUser, id: string) {
  const row = await one<{ mime: string; image: string }>(
    `SELECT d.mime, encode(d.image, 'base64') AS image
       FROM documents d JOIN profiles p ON p.id = d.profile_id
      WHERE d.id = $1 AND d.image IS NOT NULL AND (d.profile_id = $2 OR (d.shared AND p.household_id = $3))`,
    [id, user.id, user.household_id],
  );
  if (!row) throw new HttpError(404, "Foto não encontrada");
  return { mime: row.mime, bytes: Buffer.from(row.image, "base64") };
}

export async function deleteDocument(user: SessionUser, id: string) {
  const row = await one(`DELETE FROM documents WHERE id = $1 AND profile_id = $2 RETURNING id`, [id, user.id]);
  if (!row) throw new HttpError(404, "Documento não encontrado");
}

// ---------------------------------------------------------------------------
// "E se eu faltar?"

const PASSWORD_LIKE = /\b(senha|password|pin)\b\s*[:=é]\s*\S+/i;

export async function myLegacy(user: SessionUser): Promise<LegacyMine> {
  const row = await one(
    `SELECT content, trusted_id, release_mode, inactive_days, updated_at FROM legacy_vault WHERE profile_id = $1`,
    [user.id],
  );
  if (!row) return null;
  return {
    content: row.content as string,
    trustedId: (row.trusted_id as string | null) ?? null,
    releaseMode: row.release_mode as "now" | "inactive",
    inactiveDays: num(row.inactive_days),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function saveLegacy(
  user: SessionUser,
  input: { content: string; trustedId: string | null; releaseMode: "now" | "inactive"; inactiveDays: number },
) {
  if (PASSWORD_LIKE.test(input.content)) throw new HttpError(400, "Não guarde senhas aqui: escreva só onde elas estão (ex.: “no cofre de casa”).");
  if (input.trustedId) {
    const ok = await one(`SELECT 1 FROM profiles WHERE id = $1 AND household_id = $2 AND NOT is_demo AND id <> $3`, [
      input.trustedId,
      user.household_id,
      user.id,
    ]);
    if (!ok) throw new HttpError(400, "Escolha alguém da família");
  }
  await query(
    `INSERT INTO legacy_vault (profile_id, content, trusted_id, release_mode, inactive_days, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (profile_id) DO UPDATE SET content = $2, trusted_id = $3, release_mode = $4, inactive_days = $5, updated_at = now()`,
    [user.id, input.content, input.trustedId, input.releaseMode, input.inactiveDays],
  );
}

export async function deleteLegacy(user: SessionUser) {
  await query(`DELETE FROM legacy_vault WHERE profile_id = $1`, [user.id]);
}

/** Instruções que outras pessoas deixaram para mim. O texto só vem quando já foi liberado. */
export async function sharedLegacies(user: SessionUser): Promise<LegacyShared> {
  const rows = await query(
    `SELECT p.name AS owner_name, v.release_mode, v.inactive_days,
            (v.release_mode = 'now' OR p.last_seen_at < now() - make_interval(days => v.inactive_days)) AS available,
            v.content
       FROM legacy_vault v JOIN profiles p ON p.id = v.profile_id
      WHERE v.trusted_id = $1 AND p.household_id = $2`,
    [user.id, user.household_id],
  );
  return rows.map((r) => ({
    ownerName: r.owner_name as string,
    available: Boolean(r.available),
    content: r.available ? (r.content as string) : null,
    releaseMode: r.release_mode as "now" | "inactive",
    inactiveDays: num(r.inactive_days),
  }));
}

// ---------------------------------------------------------------------------
// Golpes: Pix alto para quem nunca recebeu, várias compras pequenas seguidas no cartão

export async function scamAlerts(user: SessionUser, today: string): Promise<ScamAlert[]> {
  const since = addDays(today, -7);
  const [pix, small] = await batch(
    [
      q(
        `WITH recent AS (
           SELECT t.id, t.occurred_on, t.description, t.merchant, t.amount_cents
             FROM transactions t
            WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored AND t.occurred_on >= $2::date
              AND (t.method = 'pix' OR t.description ILIKE '%pix%')
         ), typical AS (
           SELECT coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY amount_cents), 0) AS p90
             FROM transactions
            WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND occurred_on < $2::date
              AND occurred_on >= $2::date - 180 AND (method = 'pix' OR description ILIKE '%pix%')
         )
         SELECT r.id, r.occurred_on::text AS occurred_on, r.description, r.amount_cents
           FROM recent r, typical
          WHERE r.amount_cents >= greatest(50000, typical.p90 * 2)
            AND NOT EXISTS (
              SELECT 1 FROM transactions o
               WHERE o.profile_id = $1 AND o.merchant = r.merchant AND o.id <> r.id AND o.occurred_on < r.occurred_on
            )`,
        [user.id, since],
      ),
      // Teste de cartão: 3 ou mais compras de até R$ 5 no mesmo dia
      q(
        `SELECT occurred_on::text AS occurred_on, count(*)::int AS n, sum(amount_cents) AS cents
           FROM transactions
          WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND occurred_on >= $2::date AND amount_cents <= 500
          GROUP BY occurred_on HAVING count(*) >= 3`,
        [user.id, since],
      ),
    ],
    { readOnly: true },
  );
  return [
    ...pix.map((r) => ({
      id: `pix-${r.id}`,
      occurredOn: r.occurred_on as string,
      description: r.description as string,
      amountCents: num(r.amount_cents),
      reason: "Pix alto para alguém que nunca recebeu de você. Foi você mesmo? Desconfie de pedidos urgentes por mensagem.",
    })),
    ...small.map((r) => ({
      id: `small-${r.occurred_on}`,
      occurredOn: r.occurred_on as string,
      description: `${r.n} compras pequenas no mesmo dia`,
      amountCents: num(r.cents),
      reason: "Várias cobranças de poucos reais seguidas podem ser teste de cartão clonado. Confira no app do banco.",
    })),
  ];
}

// ---------------------------------------------------------------------------
// Avisos da visão geral desta parte

export async function protectionInsights(user: SessionUser, today: string): Promise<Insight[]> {
  const insights: Insight[] = [];
  const [scams, docs, reserve] = await Promise.all([scamAlerts(user, today), listDocuments(user, today), reserveStatus(user, today)]);
  if (scams.length)
    insights.push({ id: scams[0].id, icon: "🛡️", title: "Movimento suspeito", text: `${scams[0].description}: ${formatMoney(scams[0].amountCents)}. ${scams[0].reason}`, page: "seguranca" });
  const doc = docs.find((d) => d.isMine && d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= d.remindDays);
  if (doc)
    insights.push({
      id: `doc-${doc.id}`,
      icon: doc.kind === "garantia" ? "🧾" : "📄",
      title: `${doc.name}: ${doc.kind === "garantia" ? "garantia acaba" : "vence"} em ${doc.daysLeft} dia(s)`,
      text: doc.kind === "garantia" ? "Se algo estiver com defeito, acione a garantia antes do prazo." : "Renove antes de vencer.",
      page: "documentos",
    });
  if (reserve.essentialCents > 0 && reserve.months < 1)
    insights.push({
      id: "reserve-low",
      icon: "🧯",
      title: reserve.reserveCents ? `Reserva cobre ${reserve.months} mês` : "Sem reserva de emergência",
      text: `O essencial custa cerca de ${formatMoney(reserve.essentialCents)} por mês. A meta é ${reserve.targetMonths} meses.`,
      page: "reserva",
    });
  return insights;
}
