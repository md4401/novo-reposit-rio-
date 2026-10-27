// Modo criança: quanto da mesada sobrou, os cofrinhos e um botão para guardar.
import { Plus } from "lucide-react";
import { useState } from "react";
import type { KidSummary } from "../../shared/types";
import { ErrorBox, Heading, ModalHeader, Money, Panel, Progress, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { formatMoney, parseMoney } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { useApp } from "../state";

function SaveModal({ goal }: { goal: KidSummary["goals"][number] }) {
  const { toast, closeModal } = useApp();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoney(value);
    if (!cents) return toast("Quanto você quer guardar?");
    setBusy(true);
    try {
      await api(`goals/${goal.id}/contributions`, { body: { amountCents: cents } });
      toast(`Guardado no cofrinho ${goal.name}! 🐷`);
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title={`Guardar no ${goal.icon} ${goal.name}`} />
      <div className="field">
        <label htmlFor="kid-v">Quanto (R$)</label>
        <input id="kid-v" autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Guardar
        </button>
      </div>
    </form>
  );
}

export function KidHomePage() {
  const { me, openModal } = useApp();
  const { data, error, reload } = useData<KidSummary>("kid");
  return (
    <>
      <Heading title={`Oi, ${me?.profile.name.split(" ")[0] ?? ""}! 👋`} subtitle="Seu dinheiro do mês e seus cofrinhos." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          <Panel>
            <p className="small muted">Ainda tenho para gastar este mês</p>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
              <Money cents={data.leftCents} className={data.leftCents < 0 ? "down" : ""} />
            </div>
            <p className="small">
              Recebi {formatMoney(data.allowanceCents)} e gastei {formatMoney(data.spentCents)}.
            </p>
            <button type="button" className="btn dark" style={{ marginTop: 12 }} onClick={() => openModal(<NewTransactionModal />)}>
              <Plus size={15} /> Gastei
            </button>
          </Panel>
          <Panel
            title="Meus cofrinhos"
            action={
              <button type="button" className="btn ghost small" onClick={() => navigate("metas")}>
                <Plus size={13} /> Novo
              </button>
            }
          >
            {data.goals.length === 0 && <p className="small muted">Crie um cofrinho para algo que você quer muito (um jogo, uma bicicleta…).</p>}
            {data.goals.map((g) => (
              <div key={g.id} style={{ marginBottom: 14 }}>
                <div className="setting-row" style={{ border: 0, paddingBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>
                    {g.icon} {g.name}
                  </span>
                  <button type="button" className="btn primary small" onClick={() => openModal(<SaveModal goal={g} />)}>
                    Guardar
                  </button>
                </div>
                <Progress value={g.targetCents ? g.savedCents / g.targetCents : 0} tone="lime" />
                <p className="small muted" style={{ marginTop: 4 }}>
                  {formatMoney(g.savedCents)} de {formatMoney(g.targetCents)}
                  {g.savedCents >= g.targetCents ? " — conseguiu! 🎉" : ""}
                </p>
              </div>
            ))}
          </Panel>
          <Panel>
            <button type="button" className="btn ghost" onClick={() => navigate("desafios")}>
              🏆 Ver desafios
            </button>
          </Panel>
        </div>
      )}
    </>
  );
}
