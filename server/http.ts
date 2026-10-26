// Respostas JSON, erros e validação dos dados recebidos.
import { isDateKey, isMonthKey } from "../shared/time.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const CORS = {
  // A API usa token no cabeçalho Authorization (sem cookies): liberar a origem é seguro
  // e permite o app Android (Capacitor) chamar a API.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export type Body = Record<string, unknown>;

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<Body> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Arquivo ou mensagem grande demais");
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Body;
  } catch {
    // cai no erro abaixo
  }
  throw new HttpError(400, "Dados inválidos");
}

export function str(body: Body, key: string, opts: { max?: number; min?: number; optional?: boolean; label?: string } = {}) {
  const label = opts.label ?? key;
  const value = body[key];
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (opts.optional) return null;
    throw new HttpError(400, `Preencha: ${label}`);
  }
  if (typeof value !== "string") throw new HttpError(400, `Valor inválido: ${label}`);
  const trimmed = value.trim();
  if (trimmed.length > (opts.max ?? 200)) throw new HttpError(400, `Texto longo demais: ${label}`);
  if (opts.min && trimmed.length < opts.min) throw new HttpError(400, `${label}: mínimo de ${opts.min} caracteres`);
  return trimmed;
}

export function int(body: Body, key: string, min: number, max: number, label = key) {
  const value = Number(body[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, `Número inválido: ${label}`);
  return value;
}

export function bool(body: Body, key: string) {
  const value = body[key];
  if (typeof value !== "boolean") throw new HttpError(400, `Valor inválido: ${key}`);
  return value;
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new HttpError(400, `Valor inválido: ${label}`);
  return value as T;
}

export function dateKey(value: unknown, label = "data") {
  if (!isDateKey(value)) throw new HttpError(400, `Data inválida: ${label}`);
  return value;
}

export function monthParam(url: URL, fallback: string) {
  const value = url.searchParams.get("month");
  if (value === null) return fallback;
  if (!isMonthKey(value)) throw new HttpError(400, "Mês inválido");
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value: unknown, label = "id") {
  if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, `Identificador inválido: ${label}`);
  return value;
}

/** Centavos inteiros e positivos (até R$ 10 milhões). */
export function cents(value: unknown, label = "valor") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 1_000_000_000) throw new HttpError(400, `Valor inválido: ${label}`);
  return n;
}

export function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}
