import { CreditCard, FileUp, Landmark, Plus, PiggyBank, Wallet } from "lucide-react";
import { useState } from "react";
import type { Account, AccountKind } from "../../shared/types";
import { Heading, ModalHeader, Money, Panel, Spinner, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { centsToInput, parseMoney, relativeDays } from "../lib/format";
import { ImportModal, KIND_LABEL, NewAccountModal } from "../modals/AccountModals";
import { useApp } from "../state";

const ICON: Record<AccountKind, React.ReactNode> = {
  checking: <Landmark size={18} />,
  credit_card: <CreditCard size={18} />,
  savings: <PiggyBank size={18} />,
  cash: <Wallet size={18} />,
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
        title="Contas e extratos"
        subtitle="Cadastre suas contas e cartões e importe o extrato do banco (CSV ou OFX)."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => openModal(<NewAccountModal />)}>
              <Plus size={15} /> Nova conta
            </button>
            <button type="button" className="btn dark" onClick={() => openModal(<ImportModal />)}>
              <FileUp size={15} /> Importar extrato
            </button>
          </>
        }
      />
      <div className="grid-2" style={{ marginTop: 0 }}>
        <Panel title="Suas contas e cartões">
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
              {a.active && a.kind !== "cash" && (
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
                O ninho reconhece sozinho o CSV de Nubank (conta e cartão), Inter, C6 e Mercado Pago — e lê OFX de qualquer banco. A conexão
                automática (Open Finance) depende de contrato com um provedor e fica para depois.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
