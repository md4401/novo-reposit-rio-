// Contas a pagar e faturas do cartão: vencimentos, lembretes e "Paguei".
import { Check, CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { categoriesFor } from "../../shared/categories";
import type { CardInvoice, Payable } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { centsToInput, dayLabel, parseMoney } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { CategoryBadge } from "../components/icons";

type Template = { name: string; categoryId: string; recurrence: Payable["recurrence"]; seasonal?: boolean; month?: number; day?: number };
const TEMPLATES: Template[] = [
  { name: "Aluguel", categoryId: "moradia", recurrence: "monthly", day: 5 },
  { name: "Condomínio", categoryId: "moradia", recurrence: "monthly", day: 10 },
  { name: "Luz", categoryId: "moradia", recurrence: "monthly", day: 15 },
  { name: "Água", categoryId: "moradia", recurrence: "monthly", day: 15 },
  { name: "Internet", categoryId: "moradia", recurrence: "monthly", day: 10 },
  { name: "Plano de saúde", categoryId: "saude", recurrence: "monthly", day: 10 },
  { name: "IPVA", categoryId: "transporte", recurrence: "yearly", seasonal: true, month: 1, day: 20 },
  { name: "Licenciamento", categoryId: "transporte", recurrence: "yearly", seasonal: true, month: 3, day: 30 },
  { name: "IPTU", categoryId: "moradia", recurrence: "yearly", seasonal: true, month: 2, day: 10 },
  { name: "Material escolar", categoryId: "educacao", recurrence: "yearly", seasonal: true, month: 1, day: 25 },
  { name: "Matrícula escolar", categoryId: "educacao", recurrence: "yearly", seasonal: true, month: 1, day: 10 },
  { name: "Seguro do carro", categoryId: "transporte", recurrence: "yearly", seasonal: true },
];

function nextDate(today: string, t: Template) {
  if (!t.month || !t.day) return t.day ? `${today.slice(0, 8)}${String(t.day).padStart(2, "0")}` : today;
  const year = Number(today.slice(0, 4));
  const candidate = `${year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
  return candidate > today ? candidate : `${year + 1}${candidate.slice(4)}`;
}

function PayableModal({ payable }: { payable?: Payable }) {
  const { me, toast, closeModal } = useApp();
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(payable?.name ?? "");
  const [categoryId, setCategoryId] = useState(payable?.categoryId ?? "moradia");
  const [value, setValue] = useState(payable ? centsToInput(payable.amountCents) : "");
  const [dueOn, setDueOn] = useState(payable?.dueOn ?? today);
  const [recurrence, setRecurrence] = useState<Payable["recurrence"]>(payable?.recurrence ?? "monthly");
  const [remindDays, setRemindDays] = useState(payable?.remindDays ?? 3);
  const [seasonal, setSeasonal] = useState(payable?.seasonal ?? false);
  const [accountId, setAccountId] = useState(payable?.accountId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(t: Template) {
    setName(t.name);
    setCategoryId(t.categoryId);
    setRecurrence(t.recurrence);
    setSeasonal(Boolean(t.seasonal));
    setDueOn(nextDate(today, t));
    if (t.seasonal) setRemindDays(15);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseMoney(value);
    if (!amountCents || amountCents <= 0) return setError("Informe o valor");
    setBusy(true);
    try {
      const body = { name, categoryId, amountCents, dueOn, recurrence, remindDays, seasonal, accountId: accountId || null };
      await api(payable ? `payables/${payable.id}` : "payables", { method: payable ? "PATCH" : "POST", body });
      toast(payable ? "Conta atualizada." : "Conta criada. Você recebe o aviso antes de vencer.");
      closeModal();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title={payable ? "Editar conta" : "Nova conta a pagar"} subtitle="Só você vê. O ninho avisa antes de vencer." />
      {error && <div className="form-error">{error}</div>}
      {!payable && (
        <div className="template-chips">
          {TEMPLATES.map((t) => (
            <button key={t.name} type="button" className={`quick ${name === t.name ? "on" : ""}`} onClick={() => apply(t)}>
              {t.seasonal ? "🗓️ " : ""}
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <label htmlFor="pay-name">Nome</label>
        <input id="pay-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="pay-value">Valor (R$)</label>
          <input id="pay-value" required inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pay-due">Vencimento</label>
          <input id="pay-due" type="date" required value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </div>
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="pay-rec">Repete</label>
          <select id="pay-rec" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Payable["recurrence"])}>
            <option value="monthly">Todo mês</option>
            <option value="yearly">Todo ano</option>
            <option value="once">Só uma vez</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pay-remind">Avisar antes</label>
          <select id="pay-remind" value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
            {[0, 1, 3, 5, 7, 15, 30].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "No dia" : `${d} dia${d > 1 ? "s" : ""}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="pay-cat">Categoria</label>
        <select id="pay-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categoriesFor("expense").map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {(me?.accounts.length ?? 0) > 0 && (
        <div className="field">
          <label htmlFor="pay-acc">Pago com (opcional)</label>
          <select id="pay-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">—</option>
            {me!.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {recurrence === "yearly" && (
        <label className="check-line">
          <input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} />
          <span>Gasto sazonal: mostrar quanto guardar por mês até vencer</span>
        </label>
      )}
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

function PayModal({ payable }: { payable: Payable }) {
  const { me, toast, closeModal, refreshMe } = useApp();
  const [value, setValue] = useState(centsToInput(payable.amountCents));
  const [paidOn, setPaidOn] = useState(me?.today ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseMoney(value);
    if (!amountCents) return setError("Informe o valor pago");
    setBusy(true);
    try {
      await api(`payables/${payable.id}/pay`, { body: { amountCents, paidOn } });
      await refreshMe();
      toast(payable.recurrence === "once" ? "Pago! A despesa foi lançada." : "Pago! A despesa foi lançada e o próximo vencimento já está marcado.");
      closeModal();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title={`Paguei: ${payable.name}`} subtitle="Vira uma despesa no seu financeiro." />
      {error && <div className="form-error">{error}</div>}
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="pp-value">Valor pago</label>
          <input id="pp-value" inputMode="decimal" required value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pp-on">Data</label>
          <input id="pp-on" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? <Spinner /> : <Check size={15} />} Confirmar pagamento
        </button>
      </div>
    </form>
  );
}

function statusChip(p: Payable) {
  if (p.status === "overdue") return <span className="chip red">Venceu há {-p.daysLeft} dia(s)</span>;
  if (p.daysLeft === 0) return <span className="chip amber">Vence hoje</span>;
  if (p.status === "soon") return <span className="chip amber">Vence em {p.daysLeft} dia(s)</span>;
  return <span className="chip gray">{dayLabel(p.dueOn)}</span>;
}

function InvoiceRow({ i }: { i: CardInvoice }) {
  return (
    <div className="setting-row">
      <div>
        <h4>
          {i.status === "closed" ? "Fechada" : i.status === "open" ? "Aberta" : "Próxima"} · vence {dayLabel(i.dueOn)}
        </h4>
        <p>{i.status === "future" ? "Só as parcelas já previstas" : `Fecha ${dayLabel(i.closingOn)}`}</p>
      </div>
      <b className="num">
        <Money cents={i.totalCents} />
      </b>
    </div>
  );
}

export function PayablesPage() {
  const { me, openModal, toast, confirm } = useApp();
  const payables = useData<Payable[]>("payables");
  const invoices = useData<CardInvoice[]>("invoices");
  const cards = (me?.accounts ?? []).filter((a) => a.kind === "credit_card" && a.active);
  const withoutDays = cards.filter((c) => !c.closingDay || !c.dueDay);
  const byCard = new Map<string, CardInvoice[]>();
  for (const i of invoices.data ?? []) byCard.set(i.accountId, [...(byCard.get(i.accountId) ?? []), i]);
  const list = payables.data ?? [];
  const seasonal = list.filter((p) => p.monthlySavingCents);

  async function remove(p: Payable) {
    if (!(await confirm({ title: `Apagar “${p.name}”?`, text: "Os pagamentos já lançados continuam.", confirmLabel: "Apagar", danger: true }))) return;
    await api(`payables/${p.id}`, { method: "DELETE" });
    toast("Conta apagada.");
  }

  return (
    <>
      <Heading
        title="Contas a pagar"
        subtitle="Vencimentos, faturas do cartão e gastos do ano — com aviso antes de vencer."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<PayableModal />)}>
            <Plus size={15} /> Nova conta a pagar
          </button>
        }
      />
      {payables.error && <ErrorBox message={payables.error} onRetry={payables.reload} />}
      <div className="grid-2" style={{ marginTop: 0 }}>
        <div className="stack">
          <Panel title="Próximos vencimentos">
            {!payables.data ? (
              <Skeleton />
            ) : list.length === 0 ? (
              <Empty
                icon="📅"
                title="Nenhuma conta cadastrada"
                text="Cadastre aluguel, luz, internet… e também IPVA, IPTU e material escolar."
                action={
                  <button type="button" className="btn dark small" onClick={() => openModal(<PayableModal />)}>
                    <Plus size={14} /> Nova conta a pagar
                  </button>
                }
              />
            ) : (
              list.map((p) => (
                <div className="payable-row" key={p.id}>
                  <CategoryBadge id={p.categoryId} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{p.name}</h4>
                    <p className="muted small">
                      <Money cents={p.amountCents} /> · {p.recurrence === "monthly" ? "todo mês" : p.recurrence === "yearly" ? "todo ano" : "uma vez"}
                    </p>
                    <div style={{ marginTop: 6 }}>{statusChip(p)}</div>
                  </div>
                  <div className="payable-actions">
                    <button type="button" className="btn primary small" onClick={() => openModal(<PayModal payable={p} />)}>
                      <Check size={13} /> Paguei
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Editar ${p.name}`} onClick={() => openModal(<PayableModal payable={p} />)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Apagar ${p.name}`} onClick={() => void remove(p)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Faturas do cartão">
            {cards.length === 0 && <p className="muted small">Cadastre seu cartão em “Bancos e cartões” para acompanhar a fatura.</p>}
            {withoutDays.length > 0 && (
              <button type="button" className="notice info compact" style={{ width: "100%", textAlign: "left", marginBottom: 10 }} onClick={() => navigate("contas")}>
                <CreditCard size={16} />
                <span>
                  Informe o <b>dia de fechamento e de vencimento</b> de {withoutDays.map((c) => c.name).join(", ")} em Bancos e cartões.
                </span>
              </button>
            )}
            {[...byCard.entries()].map(([id, items]) => (
              <div key={id} style={{ marginBottom: 12 }}>
                <h4 style={{ marginBottom: 4 }}>💳 {items[0].accountName}</h4>
                {items.map((i) => (
                  <InvoiceRow key={`${i.dueOn}-${i.status}`} i={i} />
                ))}
              </div>
            ))}
          </Panel>
          {seasonal.length > 0 && (
            <Panel title="Gastos do ano: guarde por mês">
              {seasonal.map((p) => (
                <div className="setting-row" key={p.id}>
                  <div>
                    <h4>{p.name}</h4>
                    <p>
                      <Money cents={p.amountCents} /> em {dayLabel(p.dueOn)}
                    </p>
                  </div>
                  <b className="num">
                    <Money cents={p.monthlySavingCents!} />
                    /mês
                  </b>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
