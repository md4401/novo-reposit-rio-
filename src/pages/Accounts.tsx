import { CreditCard, FileUp, Landmark, Link2, PiggyBank, Plus, RefreshCw, Utensils, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Account, AccountKind, BankConnection, OpenFinanceInfo } from "../../shared/types";
import { BalanceHelp } from "../components/help";
import { Heading, ModalHeader, Money, Panel, Spinner, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { centsToInput, parseMoney, relativeDays } from "../lib/format";
import { ImportModal, KIND_LABEL, NewAccountModal } from "../modals/AccountModals";
import { connectBank, type ConnectResult } from "../lib/openfinance";
import { useData } from "../lib/useData";
import { useApp } from "../state";

const ICON: Record<AccountKind, React.ReactNode> = {
  checking: <Landmark size={18} />,
  credit_card: <CreditCard size={18} />,
  savings: <PiggyBank size={18} />,
  cash: <Wallet size={18} />,
  benefit: <Utensils size={18} />,
  other: <Landmark size={18} />,
};

function BalanceModal({ account }: { account: Account }) {
  const { refreshMe, toast, closeModal } = useApp();
  const [value, setValue] = useState(account.currentBalanceCents !== null ? centsToInput(account.currentBalanceCents) : "");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(balanceCents: number | null) {
    setBusy(true);
    try {
      await api(`accounts/${account.id}`, { method: "PATCH", body: { balanceCents, balanceOn: on } });
      await refreshMe();
      toast(balanceCents === null ? "Saldo removido." : "Saldo atualizado.");
      closeModal();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseMoney(value.replace("−", "-"));
        if (cents === null) return setError("Informe o saldo, ex.: 1.250,00 (ou -200,00 se estiver negativo)");
        void save(cents);
      }}
    >
      <ModalHeader title={`Saldo de ${account.name}`} subtitle="Olhe o saldo no app do banco e informe aqui. O ninho atualiza com os lançamentos seguintes." />
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="bal-value">Saldo (R$)</label>
        <input id="bal-value" inputMode="decimal" required placeholder="Ex.: 1.250,00" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="bal-on">Saldo do dia</label>
        <input id="bal-on" type="date" required value={on} onChange={(e) => setOn(e.target.value)} />
        <span className="hint">Lançamentos depois desta data entram no cálculo do saldo de hoje.</span>
      </div>
      <div className="modal-actions">
        {account.balanceCents !== null && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void save(null)}>
            Remover saldo
          </button>
        )}
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

function CardDaysModal({ account }: { account: Account }) {
  const { refreshMe, toast, closeModal } = useApp();
  const [closingDay, setClosingDay] = useState(account.closingDay ?? 1);
  const [dueDay, setDueDay] = useState(account.dueDay ?? 10);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`accounts/${account.id}`, { method: "PATCH", body: { closingDay, dueDay } });
      await refreshMe();
      toast("Datas da fatura salvas.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <form onSubmit={save}>
      <ModalHeader title={`Fatura do ${account.name}`} subtitle="Veja as datas no app do cartão. O ninho calcula a fatura atual e as próximas." />
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="cd-close">Dia do fechamento</label>
          <select id="cd-close" value={closingDay} onChange={(e) => setClosingDay(Number(e.target.value))}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cd-due">Dia do vencimento</label>
          <select id="cd-due" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
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

function Sparkline({ points }: { points: { month: string; balanceCents: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.balanceCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p.balanceCents - min) / span) * 24}`).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Evolução do saldo nos últimos 6 meses">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Resumo do que chegou do banco, numa frase. */
function syncedText(r: ConnectResult) {
  const parts = [`${r.accounts} conta${r.accounts === 1 ? "" : "s"}`];
  parts.push(r.imported ? `${r.imported} transaç${r.imported === 1 ? "ão nova" : "ões novas"}` : "nenhuma transação nova");
  if (r.investments) parts.push(`${r.investments} investimento${r.investments === 1 ? "" : "s"}`);
  return `${parts.join(", ")}${r.pending ? `. ${r.pending} para revisar.` : "."}`;
}

/** Open Finance: conectar o banco uma vez e as contas, saldos e transações chegam sozinhos. */
function OpenFinancePanel() {
  const { refreshMe, toast, confirm } = useApp();
  const { data, reload } = useData<OpenFinanceInfo>("openfinance");
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);

  async function connect(connectionId?: string) {
    setBusy(connectionId ?? "new");
    try {
      await connectBank({
        connectionId,
        onSaved: (result) => {
          setBusy(null);
          reload();
          void refreshMe();
          toast(`Banco conectado: ${syncedText(result)}`);
        },
        onError: (message) => {
          setBusy(null);
          reload();
          toast(message);
        },
        onClose: () => setBusy(null),
      });
    } catch (error) {
      setBusy(null);
      toast((error as Error).message);
    }
  }

  // Atalho "Conectar banco" do botão +: abre o widget direto
  useEffect(() => {
    if (started.current || !data?.enabled || !window.location.hash.includes("conectar=1")) return;
    started.current = true;
    window.history.replaceState(null, "", "#/contas");
    void connect();
  }, [data?.enabled]);

  async function sync(c: BankConnection) {
    setBusy(c.id);
    try {
      const result = await api<ConnectResult>(`openfinance/connections/${c.id}/sync`, { body: {} });
      await refreshMe();
      toast(`${c.connectorName} atualizado: ${syncedText(result)}`);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function disconnect(c: BankConnection) {
    const ok = await confirm({
      title: `Desconectar ${c.connectorName}?`,
      text: "O ninho para de receber os dados e a autorização é cancelada. As contas e transações que já chegaram continuam aqui; os investimentos lidos saem do Patrimônio.",
      confirmLabel: "Desconectar",
      danger: true,
    });
    if (!ok) return;
    setBusy(c.id);
    try {
      await api(`openfinance/connections/${c.id}`, { method: "DELETE" });
      await refreshMe();
      toast(`${c.connectorName} desconectado.`);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(null);
      reload();
    }
  }

  if (!data) return null;
  if (!data.enabled)
    return (
      <div className="notice info" style={{ marginBottom: 17 }}>
        <Link2 size={18} />
        <div>
          <h3>Conexão automática com bancos (Open Finance)</h3>
          <p>Ainda não ligada neste app: falta colocar as chaves da Pluggy no servidor. Enquanto isso, importe o extrato (CSV ou OFX).</p>
        </div>
      </div>
    );
  return (
    <Panel
      className="openfinance-panel"
      title="Bancos conectados"
      action={
        <button type="button" className="btn dark small" disabled={busy !== null} onClick={() => void connect()}>
          {busy === "new" ? <Spinner /> : <Link2 size={14} />} Conectar banco
        </button>
      }
    >
      {data.connections.length === 0 ? (
        <p className="muted small" style={{ marginBottom: 4 }}>
          Conecte pelo <b>Open Finance</b> e as contas, os saldos, as transações e os investimentos chegam sozinhos, todo dia. Você autoriza
          no app do banco; o ninho só lê (não faz pagamentos). Já usa o <b>Meu Pluggy</b>? Escolha “MeuPluggy” na lista.
        </p>
      ) : (
        data.connections.map((c) => (
          <div className="status-item" key={c.id}>
            {c.connectorImage ? <img className="bank-logo" src={c.connectorImage} alt="" /> : <div className="status-dot"><Landmark size={18} /></div>}
            <div>
              <h4>{c.connectorName}</h4>
              <p className={c.needsReconnect ? "down" : undefined}>
                {c.errorMessage ??
                  (c.updating && !c.lastSyncedAt
                    ? "Recebendo os dados do banco…"
                    : `${c.accounts} conta${c.accounts === 1 ? "" : "s"}${c.investments ? ` · ${c.investments} investimento${c.investments === 1 ? "" : "s"}` : ""} · atualizado ${relativeDays(c.lastSyncedAt)}`)}
              </p>
            </div>
            <div className="bank-actions">
              {c.needsReconnect ? (
                <button type="button" className="btn dark small" disabled={busy !== null} onClick={() => void connect(c.id)}>
                  {busy === c.id ? <Spinner /> : null} Reconectar
                </button>
              ) : (
                <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => void sync(c)} aria-label={`Atualizar ${c.connectorName}`}>
                  {busy === c.id ? <Spinner /> : <RefreshCw size={14} />} Atualizar
                </button>
              )}
              <button type="button" className="btn ghost small danger-text" disabled={busy !== null} onClick={() => void disconnect(c)}>
                Desconectar
              </button>
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

export function AccountsPage() {
  const { me, openModal, refreshMe, toast } = useApp();
  const accounts = me?.accounts ?? [];

  async function setActive(id: string, active: boolean) {
    await api(`accounts/${id}`, { method: "PATCH", body: { active } });
    await refreshMe();
    toast(active ? "Conta reativada." : "Conta desativada: ela sai da saúde dos dados.");
  }

  return (
    <>
      <Heading
        title="Bancos e cartões"
        subtitle="Conecte o banco pelo Open Finance, ou cadastre a conta e importe o extrato (CSV ou OFX)."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => openModal(<NewAccountModal />)}>
              <Plus size={15} /> Adicionar banco ou cartão
            </button>
            <button type="button" className="btn dark" onClick={() => openModal(<ImportModal />)}>
              <FileUp size={15} /> Importar extrato
            </button>
          </>
        }
      />
      <OpenFinancePanel />
      <div className="grid-2" style={{ marginTop: 0 }}>
        <Panel
          title={
            <h2>
              Seus bancos e cartões <BalanceHelp />
            </h2>
          }
        >
          {accounts.length === 0 && <p className="muted small">Nenhuma conta ainda. Adicione a conta corrente e o cartão que você mais usa.</p>}
          {accounts.map((a) => (
            <div className="status-item" key={a.id} style={{ opacity: a.active ? 1 : 0.55 }}>
              <div className="status-dot">{ICON[a.kind]}</div>
              <div>
                <h4>
                  {a.name}
                  {a.last4 ? ` •••• ${a.last4}` : ""}
                </h4>
                <p>
                  {KIND_LABEL[a.kind]}
                  {a.institution ? ` · ${a.institution}` : ""} · atualizada {relativeDays(a.lastSyncedAt)}
                  {a.connected && <span className="chip lime" style={{ marginLeft: 6 }}>Open Finance</span>}
                </p>
                {a.kind === "credit_card" ? (
                  <button type="button" className="account-balance link-like" onClick={() => openModal(<CardDaysModal account={a} />)}>
                    Gastos do mês: <Money cents={a.monthSpentCents} />
                    <span className="muted" style={{ fontWeight: 600, marginLeft: 8 }}>
                      {a.closingDay && a.dueDay ? `fecha dia ${a.closingDay} · vence dia ${a.dueDay}` : "informar datas da fatura"}
                    </span>
                  </button>
                ) : a.currentBalanceCents !== null ? (
                  <button type="button" className="account-balance link-like" onClick={() => openModal(<BalanceModal account={a} />)}>
                    Saldo hoje: <Money cents={a.currentBalanceCents} className={a.currentBalanceCents < 0 ? "down" : ""} />
                    <Sparkline points={a.history} />
                  </button>
                ) : (
                  a.active && (
                    <button type="button" className="link" onClick={() => openModal(<BalanceModal account={a} />)}>
                      Informar saldo
                    </button>
                  )
                )}
              </div>
              {a.active && a.kind !== "cash" && !a.connected && (
                <button type="button" className="btn ghost small" onClick={() => openModal(<ImportModal accountId={a.id} />)}>
                  Importar
                </button>
              )}
              <Toggle on={a.active} onChange={(v) => setActive(a.id, v)} label={`Conta ${a.name} ativa`} />
            </div>
          ))}
        </Panel>
        <div className="stack">
          <Panel title="Como baixar o extrato do banco">
            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13, color: "var(--text2)" }}>
              <li>Abra o app ou o site do seu banco e entre no <b>extrato</b> (ou na <b>fatura</b> do cartão).</li>
              <li>
                Procure <b>Exportar</b>, <b>Compartilhar</b> ou <b>Baixar</b> e escolha <b>CSV</b> ou <b>OFX</b> (alguns bancos chamam de “Money” ou “Excel”).
              </li>
              <li>Salve o arquivo no celular.</li>
              <li>
                Aqui no ninho, toque em <b>Importar extrato</b> e escolha o arquivo. Você vê uma prévia antes de confirmar.
              </li>
            </ol>
            <div className="modal-note" style={{ marginTop: 14 }}>
              Pode importar sempre que quiser: linhas que já entraram são puladas automaticamente. Pagamento de fatura vira “transferência”, não gasto.
            </div>
          </Panel>
          <div className="notice info">
            <Landmark size={18} />
            <div>
              <h3>Bancos reconhecidos</h3>
              <p>
                O ninho reconhece sozinho o CSV de Nubank (conta e cartão), Inter, C6 e Mercado Pago — e lê OFX de qualquer banco. Para não
                precisar importar, conecte o banco em <b>Bancos conectados</b> (Open Finance).
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
