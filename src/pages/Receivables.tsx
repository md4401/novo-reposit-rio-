// Valores a receber: reembolso do plano de saúde, da empresa, restituição do IR, dinheiro emprestado.
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Receivable } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, formatMoney, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

const KINDS: [Receivable["kind"], string, string][] = [
  ["saude", "🩺", "Reembolso do plano de saúde"],
  ["empresa", "🏢", "Reembolso da empresa"],
  ["restituicao", "🦁", "Restituição do IR"],
  ["emprestimo", "🤝", "Dinheiro que emprestei"],
  ["outro", "💰", "Outro"],
];
const kindOf = (k: Receivable["kind"]) => KINDS.find((x) => x[0] === k)!;

function ReceivableModal() {
  const { toast, closeModal } = useApp();
  const [kind, setKind] = useState<Receivable["kind"]>("saude");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseMoney(value);
    if (!amountCents) return toast("Informe o valor");
    setBusy(true);
    try {
      await api("receivables", { body: { kind, name: name || kindOf(kind)[2], amountCents, expectedOn: expectedOn || null } });
      toast("Anotado! O ninho avisa se passar da data.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title="Valor a receber" subtitle="Para ninguém esquecer de cobrar." />
      <div className="field">
        <label htmlFor="rc-kind">Tipo</label>
        <select id="rc-kind" value={kind} onChange={(e) => setKind(e.target.value as Receivable["kind"])}>
          {KINDS.map(([k, icon, label]) => (
            <option key={k} value={k}>
              {icon} {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rc-name">Descrição</label>
        <input id="rc-name" maxLength={80} placeholder={kindOf(kind)[2]} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="rc-value">Valor (R$)</label>
          <input id="rc-value" required inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rc-date">Previsto para</label>
          <input id="rc-date" type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
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

export function ReceivablesPage() {
  const { openModal, toast } = useApp();
  const { data, error, reload } = useData<Receivable[]>("receivables");
  const open = (data ?? []).filter((r) => !r.received);
  const total = open.reduce((s, r) => s + r.amountCents, 0);
  async function run(path: string, message: string, body?: unknown, method?: string) {
    try {
      await api(path, { body, method });
      toast(message);
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <>
      <Heading
        title="Valores a receber"
        subtitle="Reembolsos, restituição e dinheiro emprestado. Quando chegar, vira receita com um toque."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<ReceivableModal />)}>
            <Plus size={15} /> Novo
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <Panel>
          <Empty icon="💸" title="Nada para receber" text="Pediu reembolso do plano de saúde ou emprestou dinheiro? Anote aqui para não esquecer." />
        </Panel>
      ) : (
        <Panel title={open.length ? `Para receber: ${formatMoney(total)}` : "Tudo recebido"}>
          {data.map((r) => (
            <div key={r.id} className="setting-row" style={{ opacity: r.received ? 0.55 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <h4>
                  {kindOf(r.kind)[1]} {r.name}
                </h4>
                <p className={r.overdue ? "down" : undefined}>
                  {r.received ? "recebido ✓" : r.expectedOn ? `${r.overdue ? "atrasado desde" : "previsto para"} ${dayLabel(r.expectedOn)}` : "sem data"}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <Money cents={r.amountCents} />
                {!r.received && (
                  <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn primary small" onClick={() => void run(`receivables/${r.id}/receive`, "Recebido! Lancei como receita.", {})}>
                      <Check size={13} /> Recebi
                    </button>
                    <button
                      type="button"
                      className="btn ghost small danger-text"
                      aria-label="Apagar"
                      onClick={() => window.confirm("Apagar?") && void run(`receivables/${r.id}`, "Apagado.", undefined, "DELETE")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
