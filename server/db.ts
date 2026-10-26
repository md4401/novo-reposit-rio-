import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/** Cliente HTTP do Neon: ideal para funções serverless (sem conexão aberta). */
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    client = neon(url);
  }
  return client;
}

export type Row = Record<string, unknown>;

/** Consulta parametrizada ($1, $2…). */
export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Várias consultas numa única ida ao banco e numa única transação do Postgres
 * (tudo ou nada). Use `q()` para montar cada consulta.
 */
export async function batch(queries: { text: string; params?: unknown[] }[], opts: { readOnly?: boolean } = {}) {
  const sql = db();
  return (await sql.transaction(
    queries.map((q) => sql.query(q.text, q.params ?? [])),
    opts.readOnly ? { readOnly: true } : undefined,
  )) as Row[][];
}

export const q = (text: string, params: unknown[] = []) => ({ text, params });

/** bigint chega como string do driver: converte com segurança. */
export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
