// Categoria em botões: as mais usadas e, em "Mais categorias", todas as outras. Usado em revisar, organizar e lançar.
import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { categoriesFor } from "../../shared/categories";
import type { Direction } from "../../shared/types";
import { CategoryIcon } from "./icons";

export const QUICK_EXPENSE = ["alimentacao", "restaurantes", "moradia", "transporte", "saude", "compras", "lazer", "assinaturas", "outros"];
export const QUICK_INCOME = ["salario", "renda-extra", "aposentadoria", "reembolso", "outras-receitas"];

export function CategoryPicker({
  direction,
  value,
  onChange,
  allowAuto,
}: {
  direction: Direction;
  /** "auto" = deixar o ninho sugerir (só quando allowAuto) */
  value: string;
  onChange: (categoryId: string) => void;
  allowAuto?: boolean;
}) {
  const kind = direction === "income" ? "income" : "expense";
  const quick = kind === "income" ? QUICK_INCOME : QUICK_EXPENSE;
  const others = categoriesFor(kind).filter((c) => !quick.includes(c.id));
  // Abre sozinho quando a categoria escolhida está entre as outras
  const [more, setMore] = useState(() => others.some((c) => c.id === value));
  const chip = (id: string, label: React.ReactNode) => (
    <button key={id} type="button" role="radio" aria-checked={value === id} className={`cat-chip ${value === id ? "on" : ""}`} onClick={() => onChange(id)}>
      {label}
    </button>
  );
  return (
    <div className="cat-picker" role="radiogroup" aria-label="Categoria">
      {allowAuto &&
        chip(
          "auto",
          <>
            <Sparkles size={14} /> O ninho sugere
          </>,
        )}
      {quick.map((id) =>
        chip(
          id,
          <>
            <CategoryIcon id={id} size={14} /> {categoriesFor(kind).find((c) => c.id === id)?.name}
          </>,
        ),
      )}
      {more &&
        others.map((c) =>
          chip(
            c.id,
            <>
              <CategoryIcon id={c.id} size={14} /> {c.name}
            </>,
          ),
        )}
      {others.length > 0 && !more && (
        <button type="button" className="cat-chip cat-more-btn" onClick={() => setMore(true)} aria-expanded={false}>
          Mais categorias <ChevronDown size={14} />
        </button>
      )}
    </div>
  );
}
