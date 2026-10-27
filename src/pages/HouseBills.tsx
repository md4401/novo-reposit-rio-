// Contas da casa divididas (luz, internet, aluguel…): cada pessoa paga e lança só a sua parte.
// A conta e as partes ficam visíveis para a família de propósito; compras pessoais continuam privadas.
import { Check, Copy, Plus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { categoriesFor } from "../../shared/categories";
import { splitProportionally } from "../../shared/money";
import type { HouseBill } from "../../shared/types";
import { Avatar, Empty, ErrorBox, Heading, ModalHeader, Money, Panel, PeriodControl, Progress, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { addMonths, category, centsToInput, dayLabel, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { CategoryBadge } from "../components/icons";

function BillModal({ month }: { month: string }) {
  const { me, toast, closeModal } = useApp();
  const people = (me?.household.members ?? []).filter((m) => !m.isDemo);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("moradia");
  const [value, setValue] = useState("");
  const [dueOn, setDueOn] = useState(`${month}-10`);
  const [chosen, setChosen] = useState<string[]>(people.map((p) => p.id));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = parseMoney(value) ?? 0;
  const equal = total > 0 && chosen.length ? splitProportionally(total, chosen.map(() => 1)) : [];
  const shares = chosen.map((id, i) => ({ profileId: id, amountCents: custom[id] !== undefined ? (parseMoney(custom[id]) ?? 0) : (equal[i] ?? 0) }));
  const sum = shares.reduce((s, x) => s + x.amountCents, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (total <= 0) return setError("Informe o valor da conta");
    if (sum !== total) return setError("As partes precisam somar o valor da conta");
    setBusy(true);
    try {
      await api(`bills?month=${month}`, { body: { name, categoryId, amountCents: total, dueOn, shares } });
      toast("Conta criada. Cada pessoa marca quando pagar a sua parte.");
      closeModal();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ModalHeader title="Nova conta da casa" subtitle="Quem participa vê a conta e quanto cabe a cada um." />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="hb-name">Nome</label>
        <input id="hb-name" required maxLength={60} placeholder="Ex.: Conta de luz" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="hb-value">Valor (R$)</label>
          <input id="hb-value" required inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => (setValue(e.target.value), setCustom({}))} />
        </div>
        <div className="field">
          <label htmlFor="hb-due">Vencimento</label>
          <input id="hb-due" type="date" required value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="hb-cat">Categoria</label>
        <select id="hb-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categoriesFor("expense").map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Quem divide</label>
        {people.map((p) => {
          const on = chosen.includes(p.id);
          const share = shares.find((s) => s.profileId === p.id);
          return (
            <div className="share-line" key={p.id}>
              <label className="check-line" style={{ flex: 1, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    setCustom({});
                    setChosen((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)));
                  }}
                />
                <span>{p.name}</span>
              </label>
              {on && (
                <input
                  aria-label={`Parte de ${p.name}`}
                  inputMode="decimal"
                  style={{ width: 110 }}
                  value={custom[p.id] ?? (share ? centsToInput(share.amountCents) : "")}
                  onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
        {total > 0 && <span className={`hint ${sum !== total ? "down" : ""}`}>{sum === total ? "Partes conferidas." : `As partes somam ${centsToInput(sum)} — precisam somar ${centsToInput(total)}.`}</span>}
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy || chosen.length === 0}>
          {busy && <Spinner />} Criar conta
        </button>
      </div>
    </form>
  );
}

function BillCard({ bill, month }: { bill: HouseBill; month: string }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const mine = bill.shares.find((s) => s.isMe);
  const paid = bill.shares.filter((s) => s.paid).reduce((s, x) => s + x.amountCents, 0);
  const c = category(bill.categoryId);

  async function run(path: string, message: string, body: unknown = {}, method?: string) {
    setBusy(true);
    try {
      await api(`${path}?month=${month}`, { body, method });
      toast(message);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="bill-head">
        <CategoryBadge id={c.id} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{bill.name}</h3>
          <p className="muted small">Vence {dayLabel(bill.dueOn)} · {c.name}</p>
        </div>
        <b className="num">
          <Money cents={bill.amountCents} />
        </b>
      </div>
      <Progress value={paid / bill.amountCents} tone="lime" />
      <div style={{ marginTop: 10 }}>
        {bill.shares.map((s) => (
          <div className="share-row" key={s.profileId}>
            <Avatar name={s.name} color="#1e6650" />
            <span style={{ flex: 1 }}>
              {s.name}
              {s.isMe ? " (você)" : ""}
            </span>
            <Money cents={s.amountCents} />
            <span className={`chip ${s.paid ? "green" : "amber"}`}>{s.paid ? "Pago" : "A pagar"}</span>
          </div>
        ))}
      </div>
      <div className="bill-actions">
        {mine &&
          (mine.paid ? (
            <button type="button" className="btn ghost small" disabled={busy} onClick={() => run(`bills/${bill.id}/unpay`, "Pagamento desfeito.")}>
              <Undo2 size={13} /> Desfazer meu pagamento
            </button>
          ) : (
            <button type="button" className="btn primary small" disabled={busy} onClick={() => run(`bills/${bill.id}/pay`, "Sua parte foi lançada no seu financeiro (familiar).", { createTransaction: true })}>
              <Check size={13} /> Paguei minha parte
            </button>
          ))}
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => run(`bills/${bill.id}/duplicate`, "Conta copiada para o mês que vem.")}>
          <Copy size={13} /> Repetir no próximo mês
        </button>
        {bill.canDelete && (
          <button
            type="button"
            className="btn ghost small danger-text"
            disabled={busy}
            onClick={() => window.confirm(`Apagar “${bill.name}”? Os lançamentos já feitos continuam no financeiro de cada um.`) && run(`bills/${bill.id}`, "Conta apagada.", undefined, "DELETE")}
          >
            <Trash2 size={13} /> Apagar
          </button>
        )}
      </div>
    </Panel>
  );
}

export function HouseBillsPage() {
  const { me, openModal } = useApp();
  const today = me?.today.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(today);
  const { data, error, reload } = useData<HouseBill[]>(`bills?month=${month}`);
  const total = (data ?? []).reduce((s, b) => s + b.amountCents, 0);
  const mine = (data ?? []).flatMap((b) => b.shares.filter((s) => s.isMe && !s.paid)).reduce((s, x) => s + x.amountCents, 0);
  const next = addMonths(today, 1);

  return (
    <>
      <Heading
        title="Contas da casa"
        subtitle="Luz, internet, aluguel… divididos entre quem mora junto. Cada um lança só a própria parte."
        actions={
          <>
            <PeriodControl month={month} onChange={setMonth} max={next} />
            <button type="button" className="btn dark" onClick={() => openModal(<BillModal month={month} />)}>
              <Plus size={15} /> Nova conta
            </button>
          </>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <Panel>
          <Empty icon="🧾" title="Nenhuma conta neste mês" text="Crie a conta de luz, água ou internet e escolha quem divide." />
        </Panel>
      ) : (
        <>
          <div className="cards" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="metric">
              <span className="cap">Contas do mês</span>
              <div className="val">
                <Money cents={total} />
              </div>
            </div>
            <div className="metric dark-card">
              <span className="cap">Minha parte a pagar</span>
              <div className="val">
                <Money cents={mine} />
              </div>
            </div>
          </div>
          <div className="stack">
            {data.map((b) => (
              <BillCard key={b.id} bill={b} month={month} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
