// Orçamento: limite mensal por categoria, pessoal ou da casa, com aviso perto do limite.
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { categoriesFor } from "../../shared/categories";
import type { Budget, BudgetsPayload } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, PeriodControl, Progress, Segmented, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { category, centsToInput, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { CategoryIcon } from "../components/icons";

function BudgetModal({ scope, budget, month }: { scope: "personal" | "family"; budget?: Budget; month: string }) {
  const { toast, closeModal } = useApp();
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? "alimentacao");
  const [value, setValue] = useState(budget ? centsToInput(budget.limitCents) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const limitCents = parseMoney(value);
    if (!limitCents || limitCents <= 0) return setError("Informe um limite maior que zero");
    setBusy(true);
    try {
      await api(`budgets?month=${month}`, { method: "PUT", body: { scope, categoryId, limitCents } });
      toast("Orçamento salvo.");
      closeModal();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader
        title={budget ? "Editar limite" : scope === "family" ? "Orçamento da casa" : "Meu orçamento"}
        subtitle={scope === "family" ? "Vale para as partes marcadas como familiar, de todos." : "Vale para as suas compras (pessoais e familiares)."}
      />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="b-cat">Categoria</label>
        <select id="b-cat" value={categoryId} disabled={Boolean(budget)} onChange={(e) => setCategoryId(e.target.value)}>
          {categoriesFor("expense").map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="b-limit">Limite por mês (R$)</label>
        <input id="b-limit" inputMode="decimal" required placeholder="Ex.: 1.200,00" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

function BudgetRow({ b, editable, month }: { b: Budget; editable: boolean; month: string }) {
  const { openModal, toast } = useApp();
  const c = category(b.categoryId);
  const left = b.limitCents - b.spentCents;
  async function remove() {
    if (!window.confirm(`Apagar o limite de ${c.name}?`)) return;
    try {
      await api(`budgets/${b.id}?month=${month}`, { method: "DELETE" });
      toast("Limite apagado.");
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <div className="budget-row">
      <div className="budget-top">
        <span className="budget-name">
          <CategoryIcon id={c.id} size={16} /> {c.name}
        </span>
        <span className={`chip ${b.ratio > 1 ? "red" : b.ratio >= 0.8 ? "amber" : "green"}`}>{Math.round(b.ratio * 100)}%</span>
      </div>
      <Progress value={b.ratio} tone={b.ratio >= 0.8 ? "warn" : undefined} />
      <div className="budget-foot">
        <span>
          <Money cents={b.spentCents} /> de <Money cents={b.limitCents} />
        </span>
        <span className={left < 0 ? "down" : "muted"}>{left < 0 ? <>Passou <Money cents={-left} /></> : <>Restam <Money cents={left} /></>}</span>
      </div>
      {editable && (
        <div className="budget-actions">
          <button type="button" className="icon-btn" aria-label={`Editar ${c.name}`} onClick={() => openModal(<BudgetModal scope={b.scope} budget={b} month={month} />)}>
            <Pencil size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Apagar ${c.name}`} onClick={remove}>
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function BudgetsPage() {
  const { me, openModal } = useApp();
  const today = me?.today.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(today);
  const [tab, setTab] = useState<"personal" | "family">("personal");
  const { data, error, reload } = useData<BudgetsPayload>(`budgets?month=${month}`);
  const list = data ? (tab === "personal" ? data.personal : data.family) : [];
  const editable = tab === "personal" || Boolean(data?.canEditFamily);
  const spent = list.reduce((s, b) => s + b.spentCents, 0);
  const limit = list.reduce((s, b) => s + b.limitCents, 0);

  return (
    <>
      <Heading
        title="Orçamento"
        subtitle="Defina quanto quer gastar por categoria. A Nia avisa quando chegar a 80%."
        actions={<PeriodControl month={month} onChange={setMonth} max={today} />}
      />
      <Segmented value={tab} onChange={setTab} options={[["personal", "🔒 Meu orçamento"], ["family", "🏠 Da casa"]]} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <Panel
          title={tab === "personal" ? "Meus limites" : "Limites da casa"}
          action={
            editable ? (
              <button type="button" className="btn dark small" onClick={() => openModal(<BudgetModal scope={tab} month={month} />)}>
                <Plus size={14} /> Novo limite
              </button>
            ) : undefined
          }
        >
          {tab === "family" && !data.canEditFamily && <p className="muted small" style={{ marginBottom: 10 }}>Só quem administra a família define os limites da casa.</p>}
          {list.length === 0 ? (
            <Empty
              icon="🎯"
              title="Nenhum limite ainda"
              text={tab === "personal" ? "Comece por uma categoria em que você gasta muito, como Alimentação." : "Ex.: Moradia, Alimentação e Limpeza da casa."}
            />
          ) : (
            <>
              <div className="budget-total">
                <span>Total do mês</span>
                <b>
                  <Money cents={spent} /> de <Money cents={limit} />
                </b>
              </div>
              {list.map((b) => (
                <BudgetRow key={b.id} b={b} editable={editable} month={month} />
              ))}
            </>
          )}
        </Panel>
      )}
    </>
  );
}
