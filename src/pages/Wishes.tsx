// Lista de desejos da família: compras grandes com votos; vira meta em um toque.
import { Check, Plus, Target, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Wish } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { parseMoney } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

function WishModal() {
  const { toast, closeModal } = useApp();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = parseMoney(price);
    if (!priceCents) return toast("Informe o preço aproximado");
    setBusy(true);
    try {
      await api("wishes", { body: { name, priceCents, note: note || undefined } });
      toast("Desejo adicionado. A família pode votar.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title="Novo desejo da família" subtitle="Algo grande para a casa: TV, viagem, sofá, reforma…" />
      <div className="field">
        <label htmlFor="w-name">O que querem comprar?</label>
        <input id="w-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="w-price">Preço aproximado (R$)</label>
        <input id="w-price" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="w-note">Observação (opcional)</label>
        <input id="w-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Adicionar
        </button>
      </div>
    </form>
  );
}

export function WishesPage() {
  const { me, openModal, toast } = useApp();
  const { data, error, reload } = useData<Wish[]>("wishes");
  const members = (me?.household.members ?? []).filter((m) => !m.isDemo).length;

  async function run(path: string, message: string, method?: string) {
    try {
      await api(path, { body: method ? undefined : {}, method });
      toast(message);
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return (
    <>
      <Heading
        title="Lista de desejos"
        subtitle="As compras grandes da casa, decididas juntos. Quem tem mais votos sobe na lista."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<WishModal />)}>
            <Plus size={15} /> Novo desejo
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <Panel>
          <Empty icon="🎁" title="Nenhum desejo ainda" text="Adicione algo que a família quer comprar e votem juntos." />
        </Panel>
      ) : (
        <div className="stack">
          {data.map((w) => (
            <Panel key={w.id}>
              <div className="bill-head" style={{ marginBottom: 6 }}>
                <span className="insight-ic">{w.status === "bought" ? "✅" : w.status === "goal" ? "🎯" : "🎁"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{w.name}</h3>
                  <p className="muted small">
                    {w.createdBy ? `Sugerido por ${w.createdBy}` : "Sugestão"} · {w.votes} de {members} voto{members === 1 ? "" : "s"}
                    {w.note ? ` · ${w.note}` : ""}
                  </p>
                </div>
                <b className="num">
                  <Money cents={w.priceCents} />
                </b>
              </div>
              <div className="bill-actions">
                {w.status !== "bought" && (
                  <button type="button" className={`btn small ${w.votedByMe ? "primary" : "ghost"}`} onClick={() => void run(`wishes/${w.id}/vote`, w.votedByMe ? "Voto retirado." : "Voto registrado!")}>
                    <ThumbsUp size={13} /> {w.votedByMe ? "Votei" : "Votar"}
                  </button>
                )}
                {w.status === "open" && (
                  <button type="button" className="btn ghost small" onClick={() => void run(`wishes/${w.id}/goal`, "Virou meta da família! Contribuam em Metas.")}>
                    <Target size={13} /> Virar meta
                  </button>
                )}
                {w.status === "goal" && (
                  <button type="button" className="btn ghost small" onClick={() => navigate("metas")}>
                    <Target size={13} /> Ver meta
                  </button>
                )}
                {w.status !== "bought" && (
                  <button type="button" className="btn ghost small" onClick={() => void run(`wishes/${w.id}/bought`, "Compra realizada! 🎉")}>
                    <Check size={13} /> Compramos
                  </button>
                )}
                {w.canDelete && (
                  <button type="button" className="btn ghost small danger-text" onClick={() => window.confirm(`Apagar “${w.name}”?`) && void run(`wishes/${w.id}`, "Desejo apagado.", "DELETE")}>
                    <Trash2 size={13} /> Apagar
                  </button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
