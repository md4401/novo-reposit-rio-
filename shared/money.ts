// Dinheiro sempre em centavos inteiros. Nada de float em totais.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 → "R$ 1.234,56" */
export function formatMoney(cents: number) {
  return BRL.format(cents / 100).replace(/ /g, " ");
}

/** "R$ 9,3 mil" — para gráficos */
export function formatMoneyShort(cents: number) {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) {
    return `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return formatMoney(cents);
}

/**
 * Lê valores digitados ou falados em pt-BR: "R$ 1.234,56", "1234,56", "1234.56",
 * "80", "80 reais", "-45,90". Retorna centavos ou null.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let text = input.trim().toLowerCase().replace(/r\$|reais|real|brl/g, "").replace(/\s+/g, "");
  if (!text) return null;
  const negative = /^-|-$|\(.*\)/.test(text) || /^\(/.test(text);
  text = text.replace(/[()+-]/g, "");
  if (!/^[\d.,]+$/.test(text)) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal: "1.234,56" ou "1,234.56"
    normalized = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = text.split(",");
    normalized = parts.length > 2 ? parts.join("") : text.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = text.split(".");
    // "1.234.567" = milhares; "45.90" = decimal
    normalized = parts.length > 2 ? parts.join("") : text;
  } else {
    normalized = text;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

export type AllocationInput = { categoryId: string; amountCents: number; scope: "personal" | "family" };

/** Confere uma divisão: soma exata, sem valores zerados ou negativos. */
export function checkAllocations(totalCents: number, items: AllocationInput[]) {
  const sum = items.reduce((acc, a) => acc + a.amountCents, 0);
  const invalid = items.some((a) => !Number.isInteger(a.amountCents) || a.amountCents <= 0);
  return {
    ok: items.length > 0 && !invalid && sum === totalCents,
    sum,
    diff: totalCents - sum,
    invalid,
  };
}

/** Divide um valor proporcionalmente a pesos, fechando centavo por centavo (maior resto). */
export function splitProportionally(totalCents: number, weights: number[]) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error("pesos inválidos");
  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floors = raw.map(Math.floor);
  let rest = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return floors;
}
