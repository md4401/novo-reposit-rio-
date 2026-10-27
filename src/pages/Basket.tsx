// Cesta da família: como o preço dos produtos das notas mudou nos últimos meses.
// Só aparecem totais: nunca quem comprou nem em qual loja.
import { Camera } from "lucide-react";
import { useState } from "react";
import { monthShort } from "../../shared/time";
import type { Basket } from "../../shared/types";
import { Empty, ErrorBox, Heading, Money, Panel, Skeleton } from "../components/ui";
import { useData } from "../lib/useData";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";
import { CategoryIcon } from "../components/icons";

function change(bp: number | null) {
  if (bp === null) return <span className="muted small">sem comparação</span>;
  const pct = (bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (bp === 0) return <span className="muted small">mesmo preço</span>;
  return (
    <b className="small" style={{ color: bp > 0 ? "var(--red)" : "var(--green-ink)" }}>
      {bp > 0 ? `▲ ${pct}%` : `▼ ${pct.replace("-", "")}%`}
    </b>
  );
}

export function BasketPage() {
  const { openModal } = useApp();
  const [months, setMonths] = useState(6);
  const { data, error, reload } = useData<Basket>(`basket?months=${months}`);
  const [filter, setFilter] = useState("");
  const products = (data?.products ?? []).filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  const up = (data?.products ?? []).filter((p) => (p.changeBp ?? 0) > 0).length;

  return (
    <>
      <Heading
        title="Cesta da família"
        subtitle="O preço dos produtos das notas fiscais da casa ao longo do tempo. Sem dizer quem comprou nem onde."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<ReceiptModal />)}>
            <Camera size={15} /> Ler nota
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : data.products.length === 0 ? (
        <Panel>
          <Empty
            icon="🧺"
            title="A cesta ainda está vazia"
            text="Leia as notas fiscais das compras da casa (marcadas como da família). Quando um produto aparecer em duas notas, o ninho mostra se ficou mais caro ou mais barato."
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span className="small">
                <b>{data.products.length}</b> produtos de <b>{data.receipts}</b> notas · <b>{up}</b> ficaram mais caros
              </span>
              <select aria-label="Período" value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ marginLeft: "auto" }}>
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
            </div>
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <input aria-label="Buscar produto" placeholder="Buscar produto (arroz, leite…)" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </Panel>
          <Panel>
            {products.map((p) => (
              <div key={p.key} className="setting-row">
                <div style={{ minWidth: 0 }}>
                  <h4>
                    <CategoryIcon id={p.categoryId} size={14} /> {p.name}
                  </h4>
                  <p className="small">
                    {p.points.map((pt) => `${monthShort(pt.month)} ${(pt.avgCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join(" · ")}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Money cents={p.lastCents} />
                  <div>{change(p.changeBp)}</div>
                </div>
              </div>
            ))}
            {products.length === 0 && <p className="muted small">Nenhum produto com esse nome.</p>}
          </Panel>
        </>
      )}
    </>
  );
}
