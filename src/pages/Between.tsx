// Quem deve a quem: "paguei o mercado, você me deve metade". Só as duas pessoas envolvidas veem.
// Também guarda a renda para a divisão proporcional das contas da casa (a família vê só a porcentagem).
import { Check, Plus, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { IouPayload } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, Segmented, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, formatMoney, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

function IouModal() {
  const { me, toast, closeModal } = useApp();
  const people = (me?.household.members ?? []).filter((m) => !m.isDemo && !m.isMe);
  const [otherId, setOtherId] = useState(people[0]?.id ?? "");
  const [owedToMe, setOwedToMe] = useState<"me" | "them">("me");
  const [value, setValue] = useState("");
  const [half, setHalf] = useState(true);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const total = parseMoney(value) ?? 0;
  // "Paguei R$ 100 do mercado e era para dividir": a outra pessoa deve a metade
  const amount = half ? Math.round(total / 2) : total;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return toast("Informe o valor");
    setBusy(true);
    try {
      await api("ious", { body: { otherId, owedToMe: owedToMe === "me", amountCents: amount, description } });
      toast("Acerto registrado. A outra pessoa também vê.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }

  if (people.length === 0)
    return (
      <>
        <ModalHeader title="Novo acerto" />
        <p className="muted">Convide alguém para a família primeiro (em Configurações → Família).</p>
      </>
    );

  return (
    <form onSubmit={submit}>
      <ModalHeader title="Novo acerto" subtitle="Ex.: paguei o mercado e era para dividir." />
      <div className="field">
        <label htmlFor="iou-who">Com quem</label>
        <select id="iou-who" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Quem pagou</label>
        <Segmented
          value={owedToMe}
          onChange={setOwedToMe}
          options={[
            ["me", "Eu paguei"],
            ["them", "A outra pessoa pagou"],
          ]}
        />
      </div>
      <div className="field">
        <label htmlFor="iou-value">Valor pago (R$)</label>
        <input id="iou-value" required inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <label className="check-line">
        <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
        <span>Era para dividir meio a meio</span>
      </label>
      {amount > 0 && (
        <p className="small" style={{ marginTop: 6 }}>
          {owedToMe === "me" ? `${people.find((p) => p.id === otherId)?.name ?? "A pessoa"} fica devendo ` : "Você fica devendo "}
          <b>{formatMoney(amount)}</b>.
        </p>
      )}
      <div className="field">
        <label htmlFor="iou-desc">Do quê</label>
        <input id="iou-desc" required maxLength={80} placeholder="Ex.: mercado de sábado" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Registrar
        </button>
      </div>
    </form>
  );
}

function SplitIncomePanel() {
  const { me, toast, refreshMe } = useApp();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const members = me.household.members.filter((m) => !m.isDemo);
  async function save(clear = false) {
    const cents = clear ? null : parseMoney(value);
    if (!clear && !cents) return toast("Informe a sua renda mensal");
    setBusy(true);
    try {
      await api("me/split-income", { method: "PUT", body: { amountCents: cents } });
      await refreshMe();
      setValue("");
      toast(clear ? "Renda removida da divisão." : "Pronto! Ninguém vê o valor, só a porcentagem.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Divisão justa das contas da casa">
      <p className="small muted" style={{ marginBottom: 10 }}>
        Quando as rendas são diferentes, dividir meio a meio pesa mais para quem ganha menos. Informe a sua renda mensal: a família vê só a sua
        porcentagem, nunca o valor. Ao criar uma conta da casa, escolha “proporcional à renda”.
      </p>
      {members.map((m) => (
        <div key={m.id} className="setting-row">
          <div>
            <h4>{m.isMe ? `${m.name} (você)` : m.name}</h4>
          </div>
          <b>{m.splitBp === null ? <span className="muted small">não informou</span> : `${(m.splitBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</b>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input
          aria-label="Minha renda mensal"
          inputMode="decimal"
          placeholder={me.profile.hasSplitIncome ? "Atualizar minha renda (R$)" : "Minha renda mensal (R$)"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button type="button" className="btn dark small" disabled={busy} onClick={() => void save()}>
          Salvar
        </button>
        {me.profile.hasSplitIncome && (
          <button type="button" className="btn ghost small" disabled={busy} onClick={() => void save(true)}>
            Remover
          </button>
        )}
      </div>
    </Panel>
  );
}

export function BetweenPage() {
  const { me, openModal, toast } = useApp();
  const { data, error, reload } = useData<IouPayload>("ious");

  async function settle(body: { id?: string; otherId?: string }, message: string) {
    try {
      await api("ious/settle", { body });
      toast(message);
    } catch (err) {
      toast((err as Error).message);
    }
  }

  function whatsapp(name: string, cents: number) {
    const text = `Oi, ${name}! Pelo ninho., ficou ${formatMoney(cents)} para acertar comigo. Pode mandar um Pix quando der? 😊`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  return (
    <>
      <Heading
        title="Quem deve a quem"
        subtitle="Os acertos entre as pessoas da casa. Cada acerto só aparece para as duas pessoas envolvidas."
        actions={
          <button type="button" className="btn dark" onClick={() => openModal(<IouModal />)}>
            <Plus size={15} /> Novo acerto
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          {data.balances.length > 0 && (
            <Panel title="Saldo com cada pessoa">
              {data.balances.map((b) => (
                <div key={b.otherId} className="setting-row">
                  <div>
                    <h4>{b.name}</h4>
                    <p>{b.netCents > 0 ? `${b.name} te deve` : `Você deve a ${b.name}`}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Money cents={Math.abs(b.netCents)} className={b.netCents > 0 ? "up" : "down"} />
                    <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {b.netCents > 0 && (
                        <a className="btn ghost small" href={whatsapp(b.name, b.netCents)} target="_blank" rel="noreferrer">
                          <Share2 size={13} /> Pedir
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn primary small"
                        onClick={() => window.confirm(`Marcar tudo com ${b.name} como acertado?`) && void settle({ otherId: b.otherId }, "Tudo acertado! 🤝")}
                      >
                        <Check size={13} /> Acertar tudo
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </Panel>
          )}
          <Panel title="Acertos">
            {data.items.length === 0 ? (
              <Empty icon="🤝" title="Nenhum acerto" text="Pagou algo que era para dividir? Registre aqui e ninguém precisa lembrar de cabeça." />
            ) : (
              data.items.map((i) => (
                <div key={i.id} className="setting-row" style={{ opacity: i.settled ? 0.55 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <h4>{i.description}</h4>
                    <p>
                      {dayLabel(i.occurredOn)} · {i.owedToMe ? `${i.otherName} te deve` : `você deve a ${i.otherName}`}
                      {i.settled ? " · acertado" : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Money cents={i.amountCents} />
                    {!i.settled && (
                      <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                        <button type="button" className="btn ghost small" aria-label="Acertado" onClick={() => void settle({ id: i.id }, "Acertado!")}>
                          <Check size={13} />
                        </button>
                        {i.canDelete && (
                          <button
                            type="button"
                            className="btn ghost small danger-text"
                            aria-label="Apagar"
                            onClick={() =>
                              window.confirm("Apagar este acerto?") &&
                              void api(`ious/${i.id}`, { method: "DELETE" }).then(() => toast("Acerto apagado."), (e: Error) => toast(e.message))
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </Panel>
          {me && <SplitIncomePanel />}
        </div>
      )}
    </>
  );
}
