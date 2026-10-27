import { CATEGORY_BY_ID } from "../../shared/categories";
import type { Transaction } from "../../shared/types";

export { formatMoney, formatMoneyShort, parseMoney } from "../../shared/money";
export { dayLabel, monthLabel, monthShort, addMonths } from "../../shared/time";

export function category(id: string | null | undefined) {
  if (id === "_pendente" || !id) return { id: "_pendente", name: "A confirmar", icon: "❔", color: "#e2c56b", kind: "expense" as const };
  return CATEGORY_BY_ID.get(id) ?? { id, name: id, icon: "🧾", color: "#94aaa0", kind: "expense" as const };
}

/** Rótulo de categoria de uma transação ("Múltiplas categorias" quando dividida). */
export function txCategoryLabel(t: Transaction) {
  if (t.allocations.length === 0) return "A confirmar";
  if (t.allocations.length > 1) return "Múltiplas categorias";
  return category(t.allocations[0].categoryId).name;
}

export function txScope(t: Transaction): "family" | "personal" | "mixed" | null {
  if (t.allocations.length === 0) return null;
  const scopes = new Set(t.allocations.map((a) => a.scope));
  return scopes.size > 1 ? "mixed" : t.allocations[0].scope;
}

export function scopeLabel(scope: "family" | "personal" | "mixed" | null) {
  return scope === "family" ? "Familiar" : scope === "mixed" ? "Pessoal + familiar" : scope === "personal" ? "Pessoal" : "—";
}

/** "150,00" para preencher campos de valor */
export function centsToInput(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function relativeDays(iso: string | null) {
  if (!iso) return "nunca";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    return hours <= 0 ? "agora há pouco" : `há ${hours} h`;
  }
  return days === 1 ? "ontem" : `há ${days} dias`;
}
