// Catálogo de categorias. É a fonte da verdade: `npm run db:migrate` copia para a tabela categories.

export type CategoryKind = "expense" | "income" | "transfer";
export type Category = { id: string; name: string; icon: string; color: string; kind: CategoryKind };

export const CATEGORIES: Category[] = [
  { id: "alimentacao", name: "Alimentação", icon: "🛒", color: "#6fb293", kind: "expense" },
  { id: "restaurantes", name: "Restaurantes e delivery", icon: "🍽️", color: "#d9a066", kind: "expense" },
  { id: "moradia", name: "Moradia", icon: "🏠", color: "#244d3a", kind: "expense" },
  { id: "transporte", name: "Transporte", icon: "⛽", color: "#b9e677", kind: "expense" },
  { id: "saude", name: "Saúde", icon: "💊", color: "#4a9271", kind: "expense" },
  { id: "limpeza", name: "Limpeza", icon: "🧽", color: "#9cc9b2", kind: "expense" },
  { id: "higiene", name: "Higiene", icon: "🧴", color: "#c9e3b3", kind: "expense" },
  { id: "assinaturas", name: "Assinaturas", icon: "▶️", color: "#dce8d7", kind: "expense" },
  { id: "compras", name: "Compras", icon: "🛍️", color: "#7d9c8c", kind: "expense" },
  { id: "vestuario", name: "Roupas e calçados", icon: "👕", color: "#a3b8d9", kind: "expense" },
  { id: "beleza", name: "Beleza e cuidados", icon: "💇", color: "#e0a3b8", kind: "expense" },
  { id: "bem-estar", name: "Bem-estar e academia", icon: "🏋️", color: "#86b8a0", kind: "expense" },
  { id: "lazer", name: "Lazer", icon: "🎬", color: "#e2c56b", kind: "expense" },
  { id: "viagens", name: "Viagens", icon: "✈️", color: "#6ba6c9", kind: "expense" },
  { id: "educacao", name: "Educação", icon: "📚", color: "#5f8f7a", kind: "expense" },
  { id: "filhos", name: "Filhos", icon: "🧸", color: "#f0c987", kind: "expense" },
  { id: "pets", name: "Pets", icon: "🐾", color: "#c4a982", kind: "expense" },
  { id: "presentes", name: "Presentes e doações", icon: "🎁", color: "#c98bb0", kind: "expense" },
  { id: "impostos", name: "Impostos e taxas", icon: "🏛️", color: "#8a9a92", kind: "expense" },
  { id: "seguros", name: "Seguros", icon: "🛡️", color: "#5b7d8f", kind: "expense" },
  { id: "dividas", name: "Empréstimos e juros", icon: "📉", color: "#c97b6b", kind: "expense" },
  { id: "outros", name: "Outros", icon: "🧾", color: "#94aaa0", kind: "expense" },
  { id: "salario", name: "Salário", icon: "💼", color: "#1e6650", kind: "income" },
  { id: "renda-extra", name: "Renda extra", icon: "✨", color: "#438469", kind: "income" },
  { id: "aposentadoria", name: "Aposentadoria e pensão", icon: "🧓", color: "#2f7a5c", kind: "income" },
  { id: "beneficios", name: "Benefícios e auxílios", icon: "🎫", color: "#6aa88a", kind: "income" },
  { id: "aluguel-recebido", name: "Aluguel recebido", icon: "🔑", color: "#3e7f66", kind: "income" },
  { id: "rendimentos", name: "Rendimentos e investimentos", icon: "📈", color: "#55977a", kind: "income" },
  { id: "mesada", name: "Mesada", icon: "🪙", color: "#5d9c7e", kind: "income" },
  { id: "reembolso", name: "Reembolso e estorno", icon: "↩️", color: "#7ebaa0", kind: "income" },
  { id: "outras-receitas", name: "Outras receitas", icon: "💰", color: "#a6cdb7", kind: "income" },
  { id: "transferencia", name: "Transferência / fatura", icon: "🔁", color: "#b7c4bc", kind: "transfer" },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryName(id: string | null | undefined) {
  return (id && CATEGORY_BY_ID.get(id)?.name) || "Sem categoria";
}

export function categoriesFor(kind: CategoryKind) {
  return CATEGORIES.filter((c) => c.kind === kind);
}
