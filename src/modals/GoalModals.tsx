import { useState } from "react";
import type { Goal, Scope } from "../../shared/types";
import { ModalHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { formatMoney, parseMoney } from "../lib/format";
import { useApp } from "../state";

const ICONS = ["🎯", "🛡️", "✈️", "🏠", "🚗", "📱", "🎓", "💍", "🏖️", "✨"];

export function NewGoalModal() {
  const { closeModal, toast } = useApp();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<Scope>("personal");
  const [icon, setIcon] = useState("🎯");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoney(target);
    if (!cents || cents <= 0) return setError("Informe o valor da meta.");
    setSaving(true);
    try {
      await api("goals", { body: { name, targetCents: cents, scope, icon } });
      closeModal();
      toast(scope === "family" ? "Meta da família criada. Todos veem o progresso total." : "Meta pessoal criada.");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title="Criar nova meta" subtitle="Um objetivo só seu ou da família." />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="g-name">Nome da meta</label>
        <input id="g-name" required maxLength={60} placeholder="Ex.: Trocar de celular" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span className="field-label">Ícone</span>
        <div className="quick-cats">
          {ICONS.map((i) => (
            <button key={i} type="button" onClick={() => setIcon(i)} style={i === icon ? { background: "#e2f3df", borderColor: "#9fd09a" } : undefined} aria-label={`Ícone ${i}`}>
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="g-target">Valor desejado (R$)</label>
          <input id="g-target" required inputMode="decimal" placeholder="3.000,00" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="g-scope">Tipo de meta</label>
          <select id="g-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="personal">🔒 Pessoal</option>
            <option value="family">🏠 Da família</option>
          </select>
        </div>
      </div>
      <div className="modal-note">Nas metas da família, todos veem o total guardado; quanto cada pessoa contribuiu fica privado.</div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Cancelar
        </button>
        <button type="submit" className="btn dark" disabled={saving}>
          {saving && <Spinner />} Criar meta
        </button>
      </div>
    </form>
  );
}

export function ContributeModal({ goal }: { goal: Goal }) {
  const { closeModal, toast } = useApp();
  const [value, setValue] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoney(value);
    if (!cents || cents <= 0) return setError("Informe um valor.");
    setSaving(true);
    try {
      await api(`goals/${goal.id}/contributions`, { body: { amountCents: withdraw ? -cents : cents } });
      closeModal();
      toast(withdraw ? "Retirada registrada." : `Boa! ${formatMoney(cents)} a mais em “${goal.name}”.`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title={withdraw ? "Retirar da meta" : "Guardar na meta"} subtitle={`${goal.icon} ${goal.name} · ${formatMoney(goal.savedCents)} de ${formatMoney(goal.targetCents)}`} />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="c-value">Valor (R$)</label>
        <input id="c-value" required autoFocus inputMode="decimal" placeholder="100,00" value={value} onChange={(e) => setValue(e.target.value)} />
        <span className="hint">Você já guardou {formatMoney(goal.myContributionCents)} nesta meta.</span>
      </div>
      <label className="check-line">
        <input type="checkbox" checked={withdraw} onChange={(e) => setWithdraw(e.target.checked)} /> É uma retirada (tirei dinheiro da meta)
      </label>
      <div className="modal-note" style={{ marginTop: 14 }}>
        Aqui você registra quanto separou. O ninho não movimenta dinheiro nem faz Pix.
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => closeModal()}>
          Cancelar
        </button>
        <button type="submit" className="btn dark" disabled={saving}>
          {saving && <Spinner />} {withdraw ? "Registrar retirada" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
