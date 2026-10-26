import { CreditCard, FileUp, Landmark, Plus, PiggyBank, Wallet } from "lucide-react";
import type { AccountKind } from "../../shared/types";
import { Heading, Panel, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { relativeDays } from "../lib/format";
import { ImportModal, KIND_LABEL, NewAccountModal } from "../modals/AccountModals";
import { useApp } from "../state";

const ICON: Record<AccountKind, React.ReactNode> = {
  checking: <Landmark size={18} />,
  credit_card: <CreditCard size={18} />,
  savings: <PiggyBank size={18} />,
  cash: <Wallet size={18} />,
  other: <Landmark size={18} />,
};

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
              <h3>Conexão automática com bancos</h3>
              <p>A sincronização automática (Open Finance, via Pluggy ou Belvo) fica para uma próxima fase: exige contrato com um provedor. Por enquanto, o extrato importado já cobre o essencial.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
