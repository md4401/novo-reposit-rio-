import { Bell, Bot, Camera, Check, FileUp, Lock, Wallet } from "lucide-react";
import { useState } from "react";
import type { Personal } from "../../shared/types";
import { CategoryBars, IncomeExpenseBars } from "../components/charts";
import { TxRow } from "../components/TxRow";
import { DemoFlag, ErrorBox, Heading, LinkButton, Metric, Money, Panel, PeriodControl, Skeleton } from "../components/ui";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { ImportModal } from "../modals/AccountModals";
import { DigestModal } from "../modals/DigestModal";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";

export function PersonalPage() {
  const { me, openModal } = useApp();
  const today = me?.today.slice(0, 7) ?? "";
  const [month, setMonth] = useState(today);
  const { data, error, reload } = useData<Personal>(`personal?month=${month}`);

  return (
    <>
      <Heading
        title="Meu financeiro"
        subtitle="Um espaço só seu. Suas transações não aparecem para outras pessoas."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => openModal(<ReceiptModal />)}>
              <Camera size={15} /> Ler nota fiscal
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ImportModal />)}>
              <FileUp size={15} /> Importar extrato
            </button>
          </>
        }
      />
      <DemoFlag />
      <div className="filterbar">
        <PeriodControl month={month} onChange={setMonth} max={today} />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={300} />
      ) : (
        <>
          <div className="cards">
            <Metric label="Gastos do mês" dark icon={<Wallet size={17} />} value={<Money cents={data.totals.expenseCents} />} foot="Histórico completo é privado" />
            <Metric
              label="Compras para revisar"
              icon={<Bell size={17} />}
              value={String(data.counts.pending)}
              foot={data.counts.pending ? "Aguardando sua classificação" : "Nada pendente"}
              onClick={() => openModal(<DigestModal />)}
            />
            <Metric label="Compras categorizadas" icon={<Check size={17} />} value={`${data.counts.categorized} de ${data.counts.total}`} foot="Neste mês" />
            <Metric
              label="Regras automáticas"
              icon={<Bot size={17} />}
              value={data.activeRules ? "Ativas" : "Nenhuma"}
              foot={data.activeRules ? `${data.activeRules} aprendida(s) com você` : "Surgem quando você confirma"}
              onClick={() => navigate("ajustes")}
            />
          </div>
          <div className="grid-2">
            <Panel title="Minha movimentação" action={<LinkButton onClick={() => navigate("transacoes")}>Todas as transações</LinkButton>}>
              {data.transactions.length ? data.transactions.map((t) => <TxRow key={t.id} t={t} />) : <p className="muted small">Nenhuma movimentação neste mês.</p>}
            </Panel>
            <div className="stack">
              <Panel title="Categorias do mês">
                <CategoryBars categories={data.categories} />
                <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
                  Inclui partes pessoais e familiares das suas compras. “A confirmar” são pendências.
                </p>
              </Panel>
              <Panel title="Minhas entradas e saídas">
                <IncomeExpenseBars series={data.series} current={data.month} />
              </Panel>
              <Panel title="Privacidade primeiro">
                <div className="privacy-line" style={{ margin: 0 }}>
                  <Lock size={17} />
                  <div>
                    <strong>Visível apenas para você</strong>
                    Extratos, contas, estabelecimentos, comprovantes, conversas com a Nia e regras pessoais não são compartilhados.
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}
