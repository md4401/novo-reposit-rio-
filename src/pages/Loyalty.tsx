// Pontos, milhas e cashback que vencem; o vale-refeição/alimentação entra como conta em "Contas e extratos".
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Loyalty } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, parseMoney } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

function LoyaltyModal({ item }: { item?: Loyalty }) {
  const { toast, closeModal } = useApp();
  const [program, setProgram] = useState(item?.program ?? "");
  const [kind, setKind] = useState<Loyalty["kind"]>(item?.kind ?? "pontos");
  const [balance, setBalance] = useState(item ? String(item.balance) : "");
  const [value, setValue] = useState(item?.valueCents ? String(item.valueCents / 100).replace(".", ",") : "");
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? "");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        program,
        kind,
        balance: Number(balance.replace(/\D/g, "")) || 0,
        valueCents: value ? parseMoney(value) : null,
        expiresOn: expiresOn || null,
      };
      await api(item ? `loyalty/${item.id}` : "loyalty", { body, method: item ? "PATCH" : "POST" });
      toast("Salvo. O ninho avisa 30 dias antes de vencer.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title={item ? "Atualizar saldo" : "Pontos, milhas ou cashback"} />
      <div className="field">
        <label htmlFor="ly-program">Programa</label>
        <input id="ly-program" required maxLength={60} placeholder="Ex.: Livelo, Smiles, Méliuz" value={program} onChange={(e) => setProgram(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="ly-kind">Tipo</label>
          <select id="ly-kind" value={kind} onChange={(e) => setKind(e.target.value as Loyalty["kind"])}>
            <option value="pontos">Pontos</option>
            <option value="milhas">Milhas</option>
            <option value="cashback">Cashback</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ly-balance">Saldo</label>
          <input id="ly-balance" required inputMode="numeric" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="ly-value">Vale quanto? (R$, opcional)</label>
          <input id="ly-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ly-exp">Vence em</label>
          <input id="ly-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

export function LoyaltyPage() {
  const { me, openModal, toast } = useApp();
  const { data, error, reload } = useData<Loyalty[]>("loyalty");
  const benefits = (me?.accounts ?? []).filter((a) => a.kind === "benefit");
  return (
    <>
      <Heading
        title="Benefícios e pontos"
        subtitle="Vale-refeição, vale-alimentação, pontos, milhas e cashback — antes que vençam ou fiquem esquecidos."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<LoyaltyModal />)}>
            <Plus size={15} /> Programa
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="stack">
        <Panel title="Vale-refeição e alimentação">
          {benefits.length === 0 ? (
            <p className="small muted">
              Cadastre o cartão do VR/VA como conta (tipo “Vale-refeição / alimentação”) em{" "}
              <button type="button" className="link" onClick={() => navigate("contas")}>
                Contas e extratos
              </button>{" "}
              e informe o saldo: ele entra no saldo previsto e nos gastos de alimentação.
            </p>
          ) : (
            benefits.map((a) => (
              <div key={a.id} className="setting-row">
                <span>🍽️ {a.name}</span>
                {a.currentBalanceCents !== null ? <Money cents={a.currentBalanceCents} /> : <span className="small muted">saldo não informado</span>}
              </div>
            ))
          )}
        </Panel>
        {!data ? (
          <Skeleton />
        ) : data.length === 0 ? (
          <Panel>
            <Empty icon="✈️" title="Nenhum programa" text="Pontos do cartão e milhas vencem sem aviso. Cadastre o saldo e a data de validade." />
          </Panel>
        ) : (
          <Panel title="Pontos, milhas e cashback">
            {data.map((l) => (
              <div key={l.id} className="setting-row">
                <div>
                  <h4>{l.program}</h4>
                  <p className={l.daysLeft !== null && l.daysLeft <= 30 ? "down" : undefined}>
                    {l.balance.toLocaleString("pt-BR")} {l.kind}
                    {l.expiresOn ? ` · ${l.daysLeft! < 0 ? "venceu" : "vence"} ${dayLabel(l.expiresOn)}` : ""}
                  </p>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {l.valueCents !== null && <Money cents={l.valueCents} />}
                  <button type="button" className="btn ghost small" onClick={() => openModal(<LoyaltyModal item={l} />)}>
                    Atualizar
                  </button>
                  <button
                    type="button"
                    className="btn ghost small danger-text"
                    aria-label="Apagar"
                    onClick={() =>
                      window.confirm(`Apagar ${l.program}?`) &&
                      void api(`loyalty/${l.id}`, { method: "DELETE" }).then(() => toast("Apagado."), (e: Error) => toast(e.message))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </>
  );
}
