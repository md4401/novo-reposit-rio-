// Mesada: quem administra a família define valor, frequência e limite de gastos para um integrante.
import { useState } from "react";
import type { Allowance, Member } from "../../shared/types";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { centsToInput, parseMoney } from "../lib/format";
import { useApp } from "../state";

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function AllowanceModal({ member, current }: { member: Member; current?: Allowance }) {
  const { toast, closeModal } = useApp();
  const [value, setValue] = useState(current ? centsToInput(current.amountCents) : "");
  const [frequency, setFrequency] = useState<Allowance["frequency"]>(current?.frequency ?? "monthly");
  const [payDay, setPayDay] = useState(current?.payDay ?? 5);
  const [limit, setLimit] = useState(current?.limitCents ? centsToInput(current.limitCents) : "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseMoney(value);
    if (!amountCents) return toast("Informe o valor da mesada");
    setBusy(true);
    try {
      await api("allowances", { method: "PUT", body: { memberId: member.id, amountCents, frequency, payDay, limitCents: parseMoney(limit) || undefined } });
      toast(`Mesada de ${member.name.split(" ")[0]} salva. Ela entra sozinha no dia combinado.`);
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }

  async function stop() {
    if (!current || !window.confirm("Parar a mesada? As já pagas continuam.")) return;
    await api(`allowances/${current.id}`, { method: "DELETE" });
    toast("Mesada parada.");
    closeModal();
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title={`Mesada de ${member.name.split(" ")[0]}`} subtitle="Entra como receita no financeiro da pessoa. Você não vê as compras dela." />
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="al-value">Valor (R$)</label>
          <input id="al-value" required inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="al-freq">Frequência</label>
          <select
            id="al-freq"
            value={frequency}
            onChange={(e) => {
              const f = e.target.value as Allowance["frequency"];
              setFrequency(f);
              setPayDay(f === "weekly" ? 6 : 5);
            }}
          >
            <option value="monthly">Todo mês</option>
            <option value="weekly">Toda semana</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="al-day">{frequency === "weekly" ? "Dia da semana" : "Dia do mês"}</label>
        <select id="al-day" value={payDay} onChange={(e) => setPayDay(Number(e.target.value))}>
          {frequency === "weekly"
            ? WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))
            : Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  dia {i + 1}
                </option>
              ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="al-limit">Limite de gastos no mês (opcional)</label>
        <input id="al-limit" inputMode="decimal" placeholder="Ex.: 150,00" value={limit} onChange={(e) => setLimit(e.target.value)} />
        <span className="hint">A pessoa vê quanto já gastou do limite. Você não vê os detalhes.</span>
      </div>
      <div className="modal-actions">
        {current && (
          <button type="button" className="btn ghost" onClick={() => void stop()}>
            Parar mesada
          </button>
        )}
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}
