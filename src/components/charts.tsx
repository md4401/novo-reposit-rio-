// Gráficos leves em HTML/CSS (sem biblioteca): barras, rosca e barras por categoria.
import type { CategoryTotal, SeriesPoint } from "../../shared/types";
import { category, formatMoneyShort, monthShort } from "../lib/format";
import { useApp } from "../state";
import { Money } from "./ui";
import { CategoryIcon } from "./icons";

export function IncomeExpenseBars({ series, current }: { series: SeriesPoint[]; current: string }) {
  const max = Math.max(1, ...series.flatMap((p) => [p.incomeCents, p.expenseCents]));
  return (
    <>
      <div className="bars" style={{ gridTemplateColumns: `repeat(${series.length}, 1fr)` }}>
        {series.map((p) => (
          <div className="bar-item" key={p.month}>
            <div className="bar-track">
              <div className="bar" style={{ height: `${(p.incomeCents / max) * 100}%` }} title={`Receitas: ${formatMoneyShort(p.incomeCents)}`} />
              <div className="bar accent" style={{ height: `${(p.expenseCents / max) * 100}%` }} title={`Despesas: ${formatMoneyShort(p.expenseCents)}`} />
            </div>
            <span className={`bar-label ${p.month === current ? "current" : ""}`}>{monthShort(p.month)}</span>
          </div>
        ))}
      </div>
      <div className="legend">
        <span>
          <i className="dot" style={{ background: "var(--bar-income)" }} /> Receitas
        </span>
        <span>
          <i className="dot" style={{ background: "#438469" }} /> Despesas
        </span>
      </div>
    </>
  );
}

/** Rosca com as 3 maiores categorias + "Outras". */
export function CategoryDonut({ categories }: { categories: CategoryTotal[] }) {
  const { hidden } = useApp();
  const items = categories.filter((c) => c.cents > 0);
  const total = items.reduce((s, c) => s + c.cents, 0);
  const top = items.slice(0, 3).map((c) => ({ name: category(c.categoryId).name, color: category(c.categoryId).color, cents: c.cents }));
  const rest = items.slice(3).reduce((s, c) => s + c.cents, 0);
  if (rest > 0) top.push({ name: "Outras", color: "var(--bar-income)", cents: rest });
  let acc = 0;
  const stops = top
    .map((t) => {
      const from = (acc / total) * 100;
      acc += t.cents;
      return `${t.color} ${from}% ${(acc / total) * 100}%`;
    })
    .join(",");
  if (total === 0) return <p className="muted small">Ainda não há gastos neste mês.</p>;
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
        <div className="donut-inner">
          <small>Total de gastos</small>
          <b className="num">{hidden ? "R$ •••" : formatMoneyShort(total)}</b>
        </div>
      </div>
      <div className="donut-legend">
        {top.map((t) => (
          <div key={t.name}>
            <i className="dot" style={{ background: t.color }} />
            {t.name} <b>{Math.round((t.cents / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryBars({ categories, limit }: { categories: CategoryTotal[]; limit?: number }) {
  const items = categories.filter((c) => c.cents > 0).slice(0, limit ?? 99);
  const max = Math.max(1, ...items.map((c) => c.cents));
  if (items.length === 0) return <p className="muted small">Nada por aqui neste mês.</p>;
  return (
    <div className="cat-list">
      {items.map((c) => {
        const cat = category(c.categoryId);
        return (
          <div className="cat-item" key={c.categoryId}>
            <span className="emoji" aria-hidden="true">
              <CategoryIcon id={cat.id} size={16} />
            </span>
            <label>{cat.name}</label>
            <div className="progress">
              <div style={{ width: `${Math.max(3, (c.cents / max) * 100)}%`, background: c.categoryId === "_pendente" ? "#e2c56b" : cat.color === "#dce8d7" || cat.color === "#e4eadf" ? "#9cc9b2" : cat.color }} />
            </div>
            <b>
              <Money cents={c.cents} />
            </b>
          </div>
        );
      })}
    </div>
  );
}
