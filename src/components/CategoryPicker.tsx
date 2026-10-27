// Categoria em botões (as mais usadas) + "Outra…" com o resto. Usado em revisar, organizar e lançar.
import { Sparkles } from "lucide-react";
import { categoriesFor } from "../../shared/categories";
import type { Direction } from "../../shared/types";
import { CategoryIcon } from "./icons";

export const QUICK_EXPENSE = ["alimentacao", "moradia", "transporte", "saude", "compras", "lazer", "assinaturas", "outros"];
export const QUICK_INCOME = ["salario", "renda-extra", "reembolso", "outras-receitas"];

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
      {others.length > 0 && (
        <select
          aria-label="Outra categoria"
          className={`cat-more ${others.some((c) => c.id === value) ? "on" : ""}`}
          value={others.some((c) => c.id === value) ? value : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        >
          <option value="">Outra…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
