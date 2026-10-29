// Reunião do mês: 10 minutos com a pauta pronta (só totais da família) e os combinados da casa.
import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingAgenda } from "../../shared/types";
import { ErrorBox, Heading, ModalHeader, Money, Panel, PeriodControl, Progress, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { category, dayLabel, formatMoney, monthLabel, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

function AgreementModal() {
  const { toast, closeModal } = useApp();
  const [text, setText] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const examples = ["Compra acima de R$ 500 a gente conversa antes", "Cada um tem R$ 200 por mês para gastar sem dar satisfação", "Todo dia 5 a gente guarda para a reserva"];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("agreements", { body: { text, limitCents: limit ? parseMoney(limit) : null } });
      toast("Combinado anotado.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title="Novo combinado" subtitle="Regras simples que a família decidiu junto." />
      <div className="field">
        <label htmlFor="ag-text">Combinado</label>
        <input id="ag-text" required maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {examples.map((x) => (
            <button key={x} type="button" className="btn ghost small" onClick={() => setText(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="ag-limit">Valor que pede conversa antes (opcional)</label>
        <input id="ag-limit" inputMode="decimal" placeholder="Ex.: 500" value={limit} onChange={(e) => setLimit(e.target.value)} />
        <span className="hint">Ao lançar uma compra da família acima desse valor, o ninho lembra do combinado.</span>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

export function MeetingPage() {
  const { me, openModal, toast } = useApp();
  const thisMonth = me?.today.slice(0, 7) ?? "";
  const [month, setMonth] = useState(thisMonth);
  const { data, error, reload } = useData<MeetingAgenda>(`meeting?month=${month}`);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setNotes(data?.notes ?? ""), [data?.notes, data?.month]);

  async function save(held: boolean) {
    setSaving(true);
    try {
      await api(`meeting?month=${month}`, { method: "PUT", body: { notes, held } });
      toast(held ? "Reunião registrada. Até o mês que vem! 🎉" : "Anotações salvas.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const diff = data && data.family.previousExpenseCents ? data.family.expenseCents - data.family.previousExpenseCents : null;

  return (
    <>
      <Heading
        title="Reunião do mês"
        subtitle="10 minutos para olhar o mês juntos. A pauta usa só os totais da família — ninguém vê as compras de ninguém."
        actions={<PeriodControl month={month} onChange={setMonth} max={thisMonth} />}
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          {data.heldAt && (
            <div className="notice info">
              <Check size={18} /> Reunião de {monthLabel(month)} feita em {new Date(data.heldAt).toLocaleDateString("pt-BR")}.
            </div>
          )}
          <Panel title="1 · Como foi o mês da casa">
            <p>
              Entrou <b>{formatMoney(data.family.incomeCents)}</b> e saiu <b>{formatMoney(data.family.expenseCents)}</b> nas partes da família
              {diff !== null && (
                <>
                  {" "}
                  — <b className={diff > 0 ? "down" : "up"}>{formatMoney(Math.abs(diff))} {diff > 0 ? "a mais" : "a menos"}</b> que no mês anterior
                </>
              )}
              .
            </p>
            {data.family.topCategories.map((c) => (
              <div key={c.categoryId} className="setting-row">
                <span>
                  {category(c.categoryId).icon} {category(c.categoryId).name}
                </span>
                <Money cents={c.cents} />
              </div>
            ))}
          </Panel>
          {data.budgets.length > 0 && (
            <Panel title="2 · Orçamento da casa">
              {data.budgets.map((b) => (
                <div key={b.categoryId} style={{ marginBottom: 10 }}>
                  <div className="setting-row" style={{ border: 0, paddingBottom: 4 }}>
                    <span>{category(b.categoryId).name}</span>
                    <span className="small">
                      {formatMoney(b.spentCents)} de {formatMoney(b.limitCents)}
                    </span>
                  </div>
                  <Progress value={b.spentCents / b.limitCents} tone={b.spentCents > b.limitCents ? "warn" : undefined} />
                </div>
              ))}
            </Panel>
          )}
          {(data.bills.length > 0 || data.ious.length > 0) && (
            <Panel title="3 · Contas e acertos">
              {data.bills.map((b, n) => (
                <div key={`${b.name + b.dueOn}-${n}`} className="setting-row">
                  <div>
                    <h4>{b.name}</h4>
                    <p>vence {dayLabel(b.dueOn)}</p>
                  </div>
                  <span className={b.unpaidCents ? "down small" : "up small"}>{b.unpaidCents ? `falta ${formatMoney(b.unpaidCents)}` : "paga ✓"}</span>
                </div>
              ))}
              {data.ious.map((i, n) => (
                <div key={`${i.name}-${n}`} className="setting-row">
                  <span>{i.netCents > 0 ? `${i.name} te deve` : `Você deve a ${i.name}`}</span>
                  <Money cents={Math.abs(i.netCents)} />
                </div>
              ))}
            </Panel>
          )}
          {(data.goals.length > 0 || data.wishes.length > 0) && (
            <Panel title="4 · Metas e desejos">
              {data.goals.map((g, n) => (
                <div key={`${g.name}-${n}`} style={{ marginBottom: 10 }}>
                  <div className="setting-row" style={{ border: 0, paddingBottom: 4 }}>
                    <span>
                      {g.icon} {g.name}
                    </span>
                    <span className="small">
                      {formatMoney(g.savedCents)} de {formatMoney(g.targetCents)}
                    </span>
                  </div>
                  <Progress value={g.targetCents ? g.savedCents / g.targetCents : 0} tone="lime" />
                </div>
              ))}
              {data.wishes.map((w, n) => (
                <div key={`${w.name}-${n}`} className="setting-row">
                  <span>🎁 {w.name}</span>
                  <span className="small">
                    {formatMoney(w.priceCents)} · {w.votes} voto(s)
                  </span>
                </div>
              ))}
            </Panel>
          )}
          <Panel
            title="5 · Nossos combinados"
            action={
              <button type="button" className="btn ghost small" onClick={() => openModal(<AgreementModal />)}>
                <Plus size={13} /> Combinado
              </button>
            }
          >
            {data.agreements.length === 0 && <p className="muted small">Nenhum combinado ainda. Ex.: “compra acima de R$ 500 a gente conversa antes”.</p>}
            {data.agreements.map((a) => (
              <div key={a.id} className="setting-row">
                <div>
                  <h4>{a.text}</h4>
                  {a.createdBy && <p>por {a.createdBy}</p>}
                </div>
                {a.canDelete && (
                  <button
                    type="button"
                    className="btn ghost small danger-text"
                    aria-label="Apagar combinado"
                    onClick={() =>
                      window.confirm("Apagar este combinado?") &&
                      void api(`agreements/${a.id}`, { method: "DELETE" }).then(() => toast("Combinado apagado."), (e: Error) => toast(e.message))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </Panel>
          <Panel title="6 · O que decidimos">
            <textarea
              aria-label="Decisões da reunião"
              rows={5}
              maxLength={4000}
              placeholder="Ex.: cortar um streaming; guardar R$ 300 para a viagem; o Pedro cuida da conta de luz."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: "100%" }}
            />
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn ghost small" disabled={saving} onClick={() => void save(false)}>
                Salvar anotações
              </button>
              <button type="button" className="btn dark small" disabled={saving} onClick={() => void save(true)}>
                {saving && <Spinner />} <Check size={13} /> Reunião feita
              </button>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
