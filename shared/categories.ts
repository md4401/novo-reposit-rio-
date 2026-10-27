// Catálogo de categorias. É a fonte da verdade: `npm run db:migrate` copia para a tabela categories.

export type CategoryKind = "expense" | "income" | "transfer";
export type Category = { id: string; name: string; icon: string; color: string; kind: CategoryKind };

export const CATEGORIES: Category[] = [
  { id: "alimentacao", name: "Alimentação", icon: "🛒", color: "#6fb293", kind: "expense" },
  { id: "moradia", name: "Moradia", icon: "🏠", color: "#244d3a", kind: "expense" },
  { id: "transporte", name: "Transporte", icon: "⛽", color: "#b9e677", kind: "expense" },
  { id: "saude", name: "Saúde", icon: "💊", color: "#4a9271", kind: "expense" },
  { id: "limpeza", name: "Limpeza", icon: "🧽", color: "#9cc9b2", kind: "expense" },
  { id: "higiene", name: "Higiene", icon: "🧴", color: "#c9e3b3", kind: "expense" },
  { id: "assinaturas", name: "Assinaturas", icon: "▶️", color: "#dce8d7", kind: "expense" },
  { id: "compras", name: "Compras", icon: "🛍️", color: "#7d9c8c", kind: "expense" },
  { id: "bem-estar", name: "Bem-estar e academia", icon: "🏋️", color: "#86b8a0", kind: "expense" },
  { id: "lazer", name: "Lazer", icon: "🎬", color: "#e2c56b", kind: "expense" },
  { id: "educacao", name: "Educação", icon: "📚", color: "#5f8f7a", kind: "expense" },
  { id: "pets", name: "Pets", icon: "🐾", color: "#c4a982", kind: "expense" },
  { id: "outros", name: "Outros", icon: "🧾", color: "#94aaa0", kind: "expense" },
  { id: "salario", name: "Salário", icon: "💼", color: "#1e6650", kind: "income" },
  { id: "renda-extra", name: "Renda extra", icon: "✨", color: "#438469", kind: "income" },
  { id: "mesada", name: "Mesada", icon: "🪙", color: "#5d9c7e", kind: "income" },
  { id: "reembolso", name: "Reembolso e estorno", icon: "↩️", color: "#7ebaa0", kind: "income" },
  { id: "outras-receitas", name: "Outras receitas", icon: "💰", color: "#a6cdb7", kind: "income" },
  { id: "transferencia", name: "Transferência / fatura", icon: "🔁", color: "#b7c4bc", kind: "transfer" },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryName(id: string | null | undefined) {
  return (id && CATEGORY_BY_ID.get(id)?.name) || "A confirmar";
}

export function categoriesFor(kind: CategoryKind) {
  return CATEGORIES.filter((c) => c.kind === kind);
}
