// Etiquetas: agrupar gastos de categorias diferentes (ex.: "Viagem Bahia", "Reforma").
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Tag } from "../../shared/types";
import { Empty, ErrorBox, Heading, Money, Panel, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function TagsPage() {
  const { toast, confirm } = useApp();
  const { data, error, reload } = useData<Tag[]>("tags");
  const [name, setName] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("tags", { body: { name } });
      setName("");
      toast("Etiqueta criada. Use em “Organizar compra”.");
    } catch (err) {
      toast((err as Error).message);
    }
  }

  async function remove(t: Tag) {
    if (!(await confirm({ title: `Apagar a etiqueta “${t.name}”?`, text: "Os lançamentos continuam; só perdem a etiqueta.", confirmLabel: "Apagar", danger: true }))) return;
    await api(`tags/${t.id}`, { method: "DELETE" });
  }

  return (
    <>
      <Heading title="Etiquetas" subtitle="Junte gastos de categorias diferentes num projeto: viagem, reforma, festa, curso…" />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Panel>
        <form onSubmit={create} style={{ display: "flex", gap: 8 }}>
          <input placeholder="Nova etiqueta (ex.: Viagem Bahia)" required maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn dark">
            <Plus size={15} /> Criar
          </button>
        </form>
      </Panel>
      <Panel title="Suas etiquetas">
        {!data ? (
          <Skeleton />
        ) : data.length === 0 ? (
          <Empty icon="🏷️" title="Nenhuma etiqueta ainda" text="Crie uma e marque as compras em Transações → Organizar compra." />
        ) : (
          data.map((t) => (
            <div className="setting-row" key={t.id}>
              <button type="button" className="link-like" style={{ flex: 1, textAlign: "left" }} onClick={() => navigate(`transacoes?etiqueta=${t.id}`)}>
                <h4>🏷️ {t.name}</h4>
                <p className="muted small">
                  {t.count} lançamento{t.count === 1 ? "" : "s"} · <Money cents={t.totalCents} /> em gastos
                </p>
              </button>
              <button type="button" className="icon-btn" aria-label={`Apagar ${t.name}`} onClick={() => void remove(t)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </Panel>
    </>
  );
}
