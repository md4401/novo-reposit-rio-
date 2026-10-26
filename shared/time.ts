// Datas em pt-BR sem dependências. Transações usam data do banco (YYYY-MM-DD, sem fuso);
// "hoje" e "mês atual" são calculados no fuso da pessoa.

export const DEFAULT_TZ = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

/** "2026-10-26" no fuso informado. */
export function todayKey(tz = DEFAULT_TZ, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function toUtc(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

export function addDays(key: string, days: number) {
  return new Date(toUtc(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

export function monthOf(key: string) {
  return key.slice(0, 7);
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Intervalo [início, fim) do mês, como datas. */
export function monthRange(month: string) {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

export function daysInMonth(month: string) {
  return daysBetween(`${month}-01`, `${addMonths(month, 1)}-01`);
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "outubro de 2026" */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "Out" */
export function monthShort(month: string) {
  const m = Number(month.slice(5, 7));
  const name = MONTHS[m - 1];
  return name.charAt(0).toUpperCase() + name.slice(1, 3);
}

/** "22 out" */
export function dayLabel(key: string) {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}
