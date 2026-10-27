// Resumo diário: todas as pendências num lote só, com classificação em um toque.
import { Bot } from "lucide-react";
import type { Transaction } from "../../shared/types";
import { TxRow } from "../components/TxRow";
import { ModalHeader, Spinner } from "../components/ui";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function DigestModal() {
  const { me, closeModal } = useApp();
  const { data, loading } = useData<Transaction[]>("transactions?status=pending");
  const pending = data ?? [];
  return (
    <>
      <ModalHeader
        title="Seu resumo diário"
        subtitle={`Olá, ${me?.profile.name.split(" ")[0] ?? ""}! Revise tudo de uma vez, sem uma notificação a cada compra.`}
      />
      <div className="panel" style={{ background: "var(--soft)", boxShadow: "none", padding: 15 }}>
        <div className="eyebrow" style={{ marginBottom: 2 }}>
          Compras aguardando revisão
        </div>
        <div style={{ fontSize: 33, fontWeight: 850, margin: "4px 0" }} className="num">
          {loading && !data ? <Spinner size={22} /> : String(pending.length).padStart(2, "0")}
        </div>
        <div className="muted small">
          {pending.length ? "Toque numa compra para classificar ou dividir." : "Tudo organizado por aqui. ✨"}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {pending.map((t) => (
          <TxRow key={t.id} t={t} />
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Fechar
        </button>
        <button type="button" className="btn primary" onClick={() => closeModal(() => navigate("nia"))}>
          <Bot size={15} /> Conversar com a Nia
        </button>
      </div>
    </>
  );
}
