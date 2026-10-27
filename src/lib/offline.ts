// Lançamentos feitos sem internet ficam guardados no aparelho e são enviados quando a conexão
// volta. Cada um leva um id gerado aqui (clientRef): reenviar nunca grava duas vezes.
import type { Transaction } from "../../shared/types";
import { api, ApiError } from "./api";

const KEY = "ninho.outbox";
type Pending = { clientRef: string; body: Record<string, unknown>; savedAt: string };

function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Pending[];
  } catch {
    return [];
  }
}

function write(items: Pending[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-100)));
  } catch {
    // sem armazenamento: o lançamento não fica guardado
  }
}

function newRef() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function outboxCount() {
  return read().length;
}

/** Salva o lançamento; sem internet, guarda para enviar depois. */
export async function createTransaction(body: Record<string, unknown>): Promise<{ tx: Transaction | null; queued: boolean }> {
  const full = { ...body, clientRef: newRef() };
  try {
    return { tx: await api<Transaction>("transactions", { body: full }), queued: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      write([...read(), { clientRef: full.clientRef, body: full, savedAt: new Date().toISOString() }]);
      return { tx: null, queued: true };
    }
    throw error;
  }
}

let flushing = false;

/** Envia o que ficou guardado. Devolve quantos foram enviados. */
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of read()) {
      try {
        await api("transactions", { body: item.body, silent: true });
        sent++;
        write(read().filter((p) => p.clientRef !== item.clientRef));
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) break; // ainda sem conexão
        // Recusado pelo servidor (ex.: dado inválido): descarta para não travar a fila
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429)
          write(read().filter((p) => p.clientRef !== item.clientRef));
        else break;
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
