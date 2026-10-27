// Lista de compras da família, com o preço previsto pela cesta (notas fiscais da casa).
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShoppingList } from "../../shared/types";
import { Empty, ErrorBox, Heading, Money, Panel, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function ShoppingPage() {
  const { toast } = useApp();
  const { data, error, reload } = useData<ShoppingList>("shopping");
  const [name, setName] = useState("");
  async function run(path: string, body?: unknown, method?: string) {
    try {
      await api(path, { body, method });
    } catch (err) {
      toast((err as Error).message);
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await run("shopping", { name: name.trim() });
    setName("");
  }
  const checked = (data?.items ?? []).filter((i) => i.checked).length;
  return (
    <>
      <Heading title="Lista de compras" subtitle="A mesma lista para todo mundo da casa. O preço previsto vem das notas fiscais que a família já leu." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="stack">
        <Panel>
          <form onSubmit={add} className="row" style={{ gap: 8 }}>
            <input aria-label="Novo item" placeholder="Ex.: arroz 5 kg" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0 }} className="input" />
            <button type="submit" className="btn dark">
              <Plus size={15} /> Pôr
            </button>
          </form>
          {data && data.items.some((i) => !i.checked) && (
            <p className="small" style={{ marginTop: 10 }}>
              Previsto: <b>{formatMoney(data.estimateCents)}</b>
              {data.unknownCount > 0 ? ` + ${data.unknownCount} item(ns) sem preço conhecido` : ""}
            </p>
          )}
        </Panel>
        {!data ? (
          <Skeleton />
        ) : data.items.length === 0 ? (
          <Panel>
            <Empty icon="📝" title="Lista vazia" text="Quem lembrar que acabou, põe na lista. Na hora da compra, é só marcar." />
          </Panel>
        ) : (
          <Panel
            action={
              checked > 0 ? (
                <button type="button" className="btn ghost small" onClick={() => void run("shopping/clear", {})}>
                  Tirar os {checked} comprados
                </button>
              ) : undefined
            }
          >
            {data.items.map((i) => (
              <div key={i.id} className="setting-row" style={{ opacity: i.checked ? 0.5 : 1 }}>
                <label className="check-line" style={{ margin: 0, flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={i.checked} onChange={(e) => void run(`shopping/${i.id}`, { checked: e.target.checked }, "PATCH")} />
                  <span style={{ textDecoration: i.checked ? "line-through" : undefined }}>
                    {i.quantity > 1 ? `${i.quantity}× ` : ""}
                    {i.name}
                    {i.addedBy && <span className="small muted"> · {i.addedBy}</span>}
                  </span>
                </label>
                <div className="row" style={{ gap: 4 }}>
                  {i.estimateCents !== null && <Money cents={i.estimateCents} className="small" />}
                  {!i.checked && (
                    <>
                      <button type="button" className="btn ghost small" aria-label="Menos" disabled={i.quantity <= 1} onClick={() => void run(`shopping/${i.id}`, { quantity: i.quantity - 1 }, "PATCH")}>
                        <Minus size={12} />
                      </button>
                      <button type="button" className="btn ghost small" aria-label="Mais" onClick={() => void run(`shopping/${i.id}`, { quantity: i.quantity + 1 }, "PATCH")}>
                        <Plus size={12} />
                      </button>
                    </>
                  )}
                  {i.checked ? (
                    <Check size={14} />
                  ) : (
                    <button type="button" className="btn ghost small danger-text" aria-label="Tirar" onClick={() => void run(`shopping/${i.id}`, undefined, "DELETE")}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </>
  );
}
