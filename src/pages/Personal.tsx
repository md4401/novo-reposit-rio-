import { Bell, Camera, FileText, FileUp, Lock, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import type { Personal } from "../../shared/types";
import { CategoryBars, IncomeExpenseBars } from "../components/charts";
import { ErrorBox, Heading, LinkButton, Metric, Money, Panel, PeriodControl, Skeleton } from "../components/ui";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { ImportModal } from "../modals/AccountModals";
import { DigestModal } from "../modals/DigestModal";
import { MonthReportModal } from "../modals/MonthReportModal";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";

function vsAverage(cents: number, average: number) {
  if (!average) return "Só você vê";
  const diff = Math.round(((cents - average) / average) * 100);
  return diff === 0 ? "Igual à sua média" : `${Math.abs(diff)}% ${diff > 0 ? "acima" : "abaixo"} da sua média`;
}

export function PersonalPage() {
  const { me, openModal } = useApp();
  const today = me?.today.slice(0, 7) ?? "";
  const [month, setMonth] = useState(today);
  const { data, error, reload } = useData<Personal>(`personal?month=${month}`);
  // Média dos meses anteriores com algum gasto (sem contar o mês escolhido)
  const past = (data?.series ?? []).filter((p) => p.month < month && p.expenseCents > 0);
  const average = past.length ? Math.round(past.reduce((sum, p) => sum + p.expenseCents, 0) / past.length) : 0;

  return (
    <>
      <Heading
        title="Visão geral"
        subtitle="Como o seu dinheiro anda nos últimos meses. Só você vê."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => openModal(<MonthReportModal month={month} />)}>
              <FileText size={15} /> Relatório do mês
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ReceiptModal />)}>
              <Camera size={15} /> Ler nota fiscal
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ImportModal />)}>
              <FileUp size={15} /> Importar extrato
            </button>
          </>
        }
      />
      <div className="filterbar">
        <PeriodControl month={month} onChange={setMonth} max={today} />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={300} />
      ) : (
        <>
          <div className="cards">
            <Metric label="Gastos do mês" dark icon={<Wallet size={17} />} value={<Money cents={data.totals.expenseCents} />} foot={vsAverage(data.totals.expenseCents, average)} />
            <Metric label="Média de gastos" icon={<TrendingUp size={17} />} value={<Money cents={average} />} foot={`Últimos ${past.length || 1} meses`} />
            <Metric label="Sobrou no mês" icon={<PiggyBank size={17} />} value={<Money cents={data.totals.balanceCents} />} foot="Entradas menos saídas" />
            <Metric
              label="A revisar"
              icon={<Bell size={17} />}
              value={String(data.counts.pending)}
              foot={data.counts.pending ? "Toque para revisar" : "Nada pendente"}
              onClick={() => openModal(<DigestModal />)}
            />
          </div>
          <div className="grid-2">
            <Panel title="Entradas e saídas: 6 meses" action={<LinkButton onClick={() => navigate("transacoes")}>Ver transações</LinkButton>}>
              <IncomeExpenseBars series={data.series} current={data.month} />
            </Panel>
            <div className="stack">
              <Panel title="Categorias do mês">
                <CategoryBars categories={data.categories} />
                <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
                  Inclui partes pessoais e da família das suas compras. “Sem categoria” são as compras a revisar.
                </p>
              </Panel>
              <div className="privacy-line" style={{ margin: 0 }}>
                <Lock size={17} />
                <div>
                  <strong>Visível apenas para você</strong>
                  Extratos, contas, estabelecimentos, comprovantes, conversas com a Nia e regras pessoais não são compartilhados.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
