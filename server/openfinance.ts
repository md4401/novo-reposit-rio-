// Open Finance pela Pluggy: conectar um banco, trazer contas, saldos, transações e investimentos,
// e manter tudo em dia (aviso da Pluggy + conferência de hora em hora). Tudo é da pessoa que conectou:
// as transações entram como as de um extrato (mesmas regras, sem duplicar) e a família só vê totais.
import type { BankConnection, OpenFinanceInfo } from "../shared/types.js";
import { addDays } from "../shared/time.js";
import type { SessionUser } from "./auth.js";
import { one, query } from "./db.js";
import { HttpError, logError } from "./http.js";
import {
  createConnectToken,
  deleteItem,
  getItem,
  listAccounts,
  listInvestments,
  listTransactions,
  PluggyError,
  pluggyEnabled,
  updateItem,
  webhookSecret,
  type PluggyItem,
  type PluggyTransaction,
} from "./pluggy.js";
import { ingestRows, type IncomingRow } from "./statement-import.js";

type ConnectionRow = {
  id: string;
  profile_id: string;
  pluggy_item_id: string;
  connector_name: string;
  connector_image: string | null;
  status: string;
  execution_status: string | null;
  error_message: string | null;
  last_synced_at: string | null;
};

const FIRST_SYNC_DAYS = 180;
const RESYNC_OVERLAP_DAYS = 10;

const today = (timezone: string) => new Date().toLocaleDateString("en-CA", { timeZone: timezone });
const localDate = (iso: string, timezone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: timezone });

/**
 * Transações da Pluggy → linhas do ninho. O sentido vem do `type` (DEBIT sai, CREDIT entra), não do
 * sinal, que muda entre conta e cartão; a data é a do dia no fuso da pessoa. Pendentes só entram se
 * já aconteceram (parcelas futuras e agendamentos ficam de fora); outras moedas ficam de fora.
 */
export function pluggyRows(transactions: PluggyTransaction[], timezone: string, day: string): IncomingRow[] {
  return transactions
    .filter((t) => (!t.currencyCode || t.currencyCode === "BRL") && Number.isFinite(t.amount) && t.amount !== 0)
    .filter((t) => t.status === "POSTED" || localDate(t.date, timezone) <= day)
    .map((t) => ({
      externalId: `pluggy:${t.id}`,
      occurredOn: localDate(t.date, timezone),
      description: (t.description || "Sem descrição").replace(/\s+/g, " ").trim().slice(0, 120),
      amountCents: Math.round(Math.abs(t.amount) * 100),
      direction: t.type === "CREDIT" ? ("income" as const) : ("expense" as const),
    }));
}

/** Final da conta ou do cartão: os 4 últimos dígitos ("0001/12345-6" → "3456"). */
export function lastFour(number: string | null | undefined) {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function needsReconnect(status: string, executionStatus: string | null) {
  return (
    status === "LOGIN_ERROR" ||
    status === "WAITING_USER_INPUT" ||
    executionStatus === "USER_AUTHORIZATION_REVOKED" ||
    executionStatus === "USER_AUTHORIZATION_NOT_GRANTED" ||
    executionStatus === "INVALID_CREDENTIALS"
  );
}

/** Frase para a pessoa, a partir do estado do item na Pluggy. */
function problem(item: PluggyItem) {
  if (item.executionStatus === "USER_AUTHORIZATION_REVOKED") return "A autorização foi cancelada no banco. Reconecte para voltar a receber os dados.";
  if (needsReconnect(item.status, item.executionStatus)) return "O banco pediu para entrar de novo. Toque em Reconectar.";
  if (item.status === "OUTDATED") return "O banco não respondeu na última tentativa. Os dados podem estar atrasados.";
  return null;
}

function mapConnection(row: ConnectionRow & { accounts: number; investments: number }): BankConnection {
  return {
    id: row.id,
    connectorName: row.connector_name,
    connectorImage: row.connector_image,
    status: row.status,
    errorMessage: row.error_message,
    needsReconnect: needsReconnect(row.status, row.execution_status),
    updating: row.status === "UPDATING",
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    accounts: Number(row.accounts),
    investments: Number(row.investments),
  };
}

export async function openFinanceInfo(user: SessionUser): Promise<OpenFinanceInfo> {
  const rows = await query<ConnectionRow & { accounts: number; investments: number }>(
    `SELECT c.*,
            (SELECT count(*)::int FROM financial_accounts a WHERE a.connection_id = c.id) AS accounts,
            (SELECT count(*)::int FROM assets s WHERE s.connection_id = c.id) AS investments
       FROM bank_connections c WHERE c.profile_id = $1 ORDER BY c.created_at`,
    [user.id],
  );
  return { enabled: pluggyEnabled(), connections: rows.map(mapConnection) };
}

function requireEnabled() {
  if (!pluggyEnabled()) throw new HttpError(503, "A conexão com bancos ainda não foi configurada no servidor (chaves da Pluggy).");
}

async function ownConnection(user: SessionUser, id: string) {
  const row = await one<ConnectionRow>(`SELECT * FROM bank_connections WHERE id = $1 AND profile_id = $2`, [id, user.id]);
  if (!row) throw new HttpError(404, "Conexão não encontrada");
  return row;
}

/** Token para abrir o widget da Pluggy. Com uma conexão, abre para reconectar aquela. */
export async function connectToken(user: SessionUser, origin: string, connectionId?: string) {
  requireEnabled();
  const itemId = connectionId ? (await ownConnection(user, connectionId)).pluggy_item_id : undefined;
  // O aviso só funciona em endereço público com https (no computador de desenvolvimento, não)
  const webhookUrl = origin.startsWith("https://") ? `${origin}/api/openfinance/webhook?k=${webhookSecret()}` : undefined;
  return { accessToken: await createConnectToken({ clientUserId: user.id, webhookUrl, itemId }), itemId: itemId ?? null };
}

/** Depois do widget: guarda a conexão (só se ela foi criada para esta pessoa) e busca os dados. */
export async function saveConnection(user: SessionUser, itemId: string) {
  requireEnabled();
  let item: PluggyItem;
  try {
    item = await getItem(itemId);
  } catch (error) {
    if (error instanceof PluggyError && error.status === 404) throw new HttpError(404, "Conexão não encontrada na Pluggy");
    throw error;
  }
  // O item carrega o id de quem pediu o token: ninguém liga ao seu perfil o banco de outra pessoa
  if (item.clientUserId !== user.id) throw new HttpError(403, "Essa conexão não foi feita por você");
  const row = await one<ConnectionRow>(
    `INSERT INTO bank_connections (profile_id, pluggy_item_id, connector_name, connector_image, status, execution_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pluggy_item_id) DO UPDATE SET status = EXCLUDED.status, execution_status = EXCLUDED.execution_status
       WHERE bank_connections.profile_id = EXCLUDED.profile_id
     RETURNING *`,
    [user.id, item.id, item.connector.name.slice(0, 80), item.connector.imageUrl ?? null, item.status, item.executionStatus],
  );
  if (!row) throw new HttpError(403, "Essa conexão não foi feita por você");
  return syncConnection(user, row, item);
}

/** Traz contas, saldos, transações e investimentos de uma conexão. */
export async function syncConnection(user: SessionUser, connection: ConnectionRow, known?: PluggyItem) {
  const item = known ?? (await getItem(connection.pluggy_item_id));
  const day = today(user.timezone);
  const since = connection.last_synced_at
    ? addDays(localDate(connection.last_synced_at, user.timezone), -RESYNC_OVERLAP_DAYS)
    : addDays(day, -FIRST_SYNC_DAYS);
  let accounts = 0;
  let imported = 0;
  let pending = 0;

  for (const acc of await listAccounts(item.id)) {
    if (acc.currencyCode && acc.currencyCode !== "BRL") continue;
    const kind = acc.type === "CREDIT" ? "credit_card" : acc.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking";
    // Saldo só de conta (no cartão, "saldo" é a fatura)
    const balance = acc.type === "BANK" && Number.isFinite(acc.balance) ? Math.round(acc.balance * 100) : null;
    const saved = await one<{ id: string }>(
      `INSERT INTO financial_accounts (profile_id, name, kind, institution, last4, connection_id, pluggy_account_id, balance_cents, balance_on, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8::bigint IS NULL THEN NULL ELSE $9::date END, now())
       ON CONFLICT (pluggy_account_id) DO UPDATE
         SET connection_id = EXCLUDED.connection_id, active = true, last_synced_at = now(),
             balance_cents = coalesce(EXCLUDED.balance_cents, financial_accounts.balance_cents),
             balance_on = coalesce(EXCLUDED.balance_on, financial_accounts.balance_on)
         WHERE financial_accounts.profile_id = EXCLUDED.profile_id
       RETURNING id`,
      [
        user.id,
        (acc.marketingName || acc.name || item.connector.name).slice(0, 60),
        kind,
        item.connector.name.slice(0, 60),
        lastFour(acc.number),
        connection.id,
        acc.id,
        balance,
        day,
      ],
    );
    if (!saved) continue;
    accounts++;
    const rows = pluggyRows(await listTransactions(acc.id, since), user.timezone, day);
    const result = await ingestRows(user, saved.id, rows, { source: "openfinance", commit: true });
    imported += result.imported;
    pending += result.pending;
  }

  // Investimentos viram itens do Patrimônio (só a foto do saldo; some ao desconectar)
  let investments = 0;
  try {
    const list = (await listInvestments(item.id)).filter((i) => i.status !== "TOTAL_WITHDRAWAL" && (!i.currencyCode || i.currencyCode === "BRL"));
    for (const inv of list) {
      const value = Math.max(0, Math.round((inv.balance ?? inv.amount ?? 0) * 100));
      await query(
        `INSERT INTO assets (profile_id, name, kind, value_cents, updated_on, connection_id, pluggy_investment_id)
         VALUES ($1, $2, 'investment', $3, $4, $5, $6)
         ON CONFLICT (pluggy_investment_id) DO UPDATE SET value_cents = EXCLUDED.value_cents, updated_on = EXCLUDED.updated_on
           WHERE assets.profile_id = EXCLUDED.profile_id`,
        [user.id, `${inv.name} · ${item.connector.name}`.slice(0, 80), value, day, connection.id, inv.id],
      );
      investments++;
    }
    await query(`DELETE FROM assets WHERE connection_id = $1 AND NOT (pluggy_investment_id = ANY($2::text[]))`, [connection.id, list.map((i) => i.id)]);
  } catch (error) {
    logError(error); // banco sem investimentos ou produto não liberado: segue sem eles
  }

  await query(
    // Enquanto o banco ainda está montando os dados, não conta como sincronizada: a próxima busca
    // volta a pegar o histórico inteiro em vez de só os últimos dias
    `UPDATE bank_connections SET status = $2, execution_status = $3, error_message = $4, connector_name = $5, connector_image = $6,
            last_synced_at = CASE WHEN $7 THEN now() ELSE last_synced_at END
      WHERE id = $1`,
    [connection.id, item.status, item.executionStatus, problem(item), item.connector.name.slice(0, 80), item.connector.imageUrl ?? null, item.status !== "UPDATING"],
  );
  return { accounts, imported, pending, investments };
}

/** Botão "Atualizar": pede dados novos ao banco (quando dá) e traz o que já estiver pronto. */
export async function refreshConnection(user: SessionUser, id: string) {
  requireEnabled();
  const connection = await ownConnection(user, id);
  try {
    await updateItem(connection.pluggy_item_id);
  } catch (error) {
    // Conexões do Meu Pluggy não aceitam: elas se atualizam sozinhas uma vez por dia
    if (!(error instanceof PluggyError) || error.status >= 500) throw error;
  }
  return syncConnection(user, connection);
}

/** Desconecta: cancela a autorização na Pluggy. Contas e transações já trazidas ficam. */
export async function removeConnection(user: SessionUser, id: string) {
  requireEnabled();
  const connection = await ownConnection(user, id);
  try {
    await deleteItem(connection.pluggy_item_id);
  } catch (error) {
    if (!(error instanceof PluggyError) || error.status !== 404) throw error;
  }
  await query(`DELETE FROM bank_connections WHERE id = $1 AND profile_id = $2`, [connection.id, user.id]);
}

async function ownerOf(connection: ConnectionRow) {
  return one<SessionUser>(
    `SELECT id, household_id, name, email, role, avatar_color, timezone, digest_hour, default_scope, '' AS session_id
       FROM profiles WHERE id = $1`,
    [connection.profile_id],
  );
}

/** Confere se o aviso veio da Pluggy: segredo no endereço e o id do nosso app no corpo. */
export function checkWebhook(key: string | null, body: Record<string, unknown>) {
  if (!pluggyEnabled() || key !== webhookSecret()) throw new HttpError(401, "Aviso não reconhecido");
  if (body.clientId && body.clientId !== process.env.PLUGGY_CLIENT_ID) throw new HttpError(401, "Aviso não reconhecido");
}

/** Aviso da Pluggy (item atualizado, transações novas…): busca os dados daquela conexão. */
export async function handleWebhook(body: Record<string, unknown>) {
  const event = String(body.event ?? "");
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (!itemId) return { ignored: true };
  const connection = await one<ConnectionRow>(`SELECT * FROM bank_connections WHERE pluggy_item_id = $1`, [itemId]);
  if (!connection) return { ignored: true };
  if (event === "item/deleted") {
    await query(`DELETE FROM bank_connections WHERE id = $1`, [connection.id]);
    return { deleted: true };
  }
  if (!/^(item\/(created|updated|error|login_succeeded|waiting_user_input)|transactions\/(created|updated))$/.test(event)) return { ignored: true };
  const user = await ownerOf(connection);
  if (!user) return { ignored: true };
  return syncConnection(user, connection);
}

/** Conferência de hora em hora: atualiza as conexões mais antigas (poucas por vez). */
export async function syncStaleConnections(limit = 4) {
  if (!pluggyEnabled()) return { synced: 0 };
  const rows = await query<ConnectionRow>(
    `SELECT * FROM bank_connections WHERE last_synced_at IS NULL OR last_synced_at < now() - interval '12 hours'
      ORDER BY last_synced_at NULLS FIRST LIMIT $1`,
    [limit],
  );
  let synced = 0;
  for (const connection of rows) {
    try {
      const user = await ownerOf(connection);
      if (!user) continue;
      await syncConnection(user, connection);
      synced++;
    } catch (error) {
      logError(error);
      await query(`UPDATE bank_connections SET error_message = $2, last_synced_at = now() WHERE id = $1`, [
        connection.id,
        "Não foi possível falar com o banco agora. Tentamos de novo mais tarde.",
      ]);
    }
  }
  return { synced };
}
