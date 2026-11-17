// Cliente da API da Pluggy (Open Finance). As chaves ficam só no servidor (PLUGGY_CLIENT_ID e
// PLUGGY_CLIENT_SECRET); o celular recebe apenas o token de conexão, que vale 30 minutos.
import { createHash } from "node:crypto";

const BASE = "https://api.pluggy.ai";

export function pluggyEnabled() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

export class PluggyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// A chave da API vale 2 horas e o /auth tem limite próprio: reaproveita enquanto der
let cached: { key: string; until: number } | null = null;

async function apiKey(force = false) {
  if (!force && cached && cached.until > Date.now()) return cached.key;
  const response = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new PluggyError(response.status, `Pluggy recusou as chaves (${response.status})`);
  const { apiKey: key } = (await response.json()) as { apiKey: string };
  cached = { key, until: Date.now() + 100 * 60 * 1000 };
  return key;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { "X-API-KEY": await apiKey(retried), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(25_000),
  });
  // Chave vencida antes da hora: pede outra uma vez
  if (response.status === 401 && !retried) return call<T>(path, init, true);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PluggyError(response.status, `Pluggy ${init.method ?? "GET"} ${path.split("?")[0]} → ${response.status}: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export type PluggyItem = {
  id: string;
  status: "UPDATED" | "UPDATING" | "LOGIN_ERROR" | "OUTDATED" | "WAITING_USER_INPUT";
  executionStatus: string | null;
  clientUserId: string | null;
  connector: { id: number; name: string; imageUrl?: string | null };
  error?: { code?: string; message?: string } | null;
  lastUpdatedAt?: string | null;
};

export type PluggyAccount = {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD" | string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  currencyCode: string;
  creditData?: { balanceCloseDate?: string | null; balanceDueDate?: string | null } | null;
};

export type PluggyTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: "DEBIT" | "CREDIT";
  status: "POSTED" | "PENDING";
  currencyCode: string;
};

export type PluggyInvestment = {
  id: string;
  name: string;
  type: string;
  balance: number | null;
  amount: number | null;
  currencyCode: string;
  status: "ACTIVE" | "PENDING" | "TOTAL_WITHDRAWAL" | null;
};

/** Token para o widget de conexão. Com itemId, serve para reconectar aquela conexão. */
export async function createConnectToken(options: { clientUserId: string; webhookUrl?: string; itemId?: string }) {
  const { accessToken } = await call<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body: {
      ...(options.itemId ? { itemId: options.itemId } : {}),
      options: { clientUserId: options.clientUserId, ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}), avoidDuplicates: true },
    },
  });
  return accessToken;
}

export const getItem = (id: string) => call<PluggyItem>(`/items/${encodeURIComponent(id)}`);

/** Pede ao banco dados novos. Conexões vindas do Meu Pluggy não aceitam (seguem a original). */
export const updateItem = (id: string) => call<PluggyItem>(`/items/${encodeURIComponent(id)}`, { method: "PATCH", body: {} });

export const deleteItem = (id: string) => call<{ count: number }>(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function listAccounts(itemId: string) {
  const { results } = await call<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}&pageSize=500`);
  return results;
}

/** Transações de uma conta a partir de uma data (até 500 por página, segue o cursor). */
export async function listTransactions(accountId: string, dateFrom: string) {
  const all: PluggyTransaction[] = [];
  let path: string | null = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;
  for (let page = 0; path && page < 20; page++) {
    const { results, next }: { results: PluggyTransaction[]; next: string | null } = await call(path);
    all.push(...results);
    path = next ? `/v2/transactions${next}` : null;
  }
  return all;
}

export async function listInvestments(itemId: string) {
  const { results } = await call<{ results: PluggyInvestment[] }>(`/investments?itemId=${encodeURIComponent(itemId)}&pageSize=500`);
  return results;
}

/**
 * Segredo que vai no endereço do aviso (webhook): a Pluggy não assina os avisos, e o endereço só é
 * conhecido por ela. Derivado da chave secreta, então não precisa de outra variável.
 */
export function webhookSecret() {
  return createHash("sha256").update(`ninho-webhook:${process.env.PLUGGY_CLIENT_SECRET ?? ""}`).digest("hex").slice(0, 32);
}
