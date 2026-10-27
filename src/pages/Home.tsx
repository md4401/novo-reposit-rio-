import { ArrowLeftRight, Bell, CalendarCheck, ChevronRight, Plus, Wallet, Activity, TriangleAlert } from "lucide-react";
import type { Overview } from "../../shared/types";
import { CategoryDonut, IncomeExpenseBars } from "../components/charts";
import { TxRow } from "../components/TxRow";
import { DemoFlag, ErrorBox, Heading, LinkButton, Metric, Money, Panel, Skeleton } from "../components/ui";
import { monthLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { DigestModal } from "../modals/DigestModal";
import { MonthReportModal } from "../modals/MonthReportModal";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { useApp } from "../state";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** O selo diz só o que o app sabe: orçamento (se houver) ou quanto sobrou. */
function balanceFoot(data: Overview) {
  const b = data.budgets;
  if (b.total > 0) {
    if (b.over > 0) return `${b.over} categoria${b.over > 1 ? "s" : ""} acima do orçamento`;
    if (b.near > 0) return `${b.near} perto do limite do orçamento`;
    return (
      <>
        <span className="up">✓</span> Dentro do orçamento
      </>
    );
  }
  return data.family.balanceCents >= 0 ? "Sobrou no mês até agora · defina um orçamento" : "Gastos acima das receitas";
}

export function HomePage() {
  const { me, openModal } = useApp();
  const { data, error, reload } = useData<Overview>("overview");
  const pending = me?.pendingCount ?? 0;
  const first = me?.profile.name.split(" ")[0] ?? "";

  return (
    <>
      <Heading
        title={`Olá, ${first}! Que bom te ver. 👋`}
        subtitle="Seu dinheiro, no seu ritmo. Confira o que acontece com suas finanças hoje."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => openModal(<DigestModal />)}>
              <Bell size={15} /> Resumo diário {pending > 0 && <span className="chip lime">{pending}</span>}
            </button>
            <button type="button" className="btn dark hide-mobile" onClick={() => openModal(<NewTransactionModal />)}>
              <Plus size={16} /> Nova despesa
            </button>
          </>
        }
      />
      <DemoFlag />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data?.closingMonth && (
        <button type="button" className="notice info compact" style={{ width: "100%", textAlign: "left", marginBottom: 16 }} onClick={() => openModal(<MonthReportModal month={data.closingMonth!} />)}>
          <CalendarCheck size={17} />
          <span style={{ flex: 1 }}>
            <b>{capitalize(monthLabel(data.closingMonth).split(" ")[0])} fechou:</b> veja seu mês em 5 números e baixe o relatório.
          </span>
          <ChevronRight size={16} />
        </button>
      )}
      {!data ? (
        <div className="cards">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {data.dataWarning && (
            <button type="button" className="notice warn compact" style={{ width: "100%", textAlign: "left", marginBottom: 16 }} onClick={() => navigate("saude")}>
              <TriangleAlert size={17} />
              <span style={{ flex: 1 }}>
                <b>Alguns dados podem estar incompletos:</b> há conta sem atualização recente.
              </span>
              <ChevronRight size={16} />
            </button>
          )}
          <div className="cards">
            <Metric label="Receitas da família" icon={<Wallet size={17} />} value={<Money cents={data.family.incomeCents} />} foot="Total compartilhado no mês" onClick={() => navigate("familia")} />
            <Metric
              label="Despesas da família"
              icon={<ArrowLeftRight size={17} />}
              value={<Money cents={data.family.expenseCents} />}
              foot={data.family.incomeCents > 0 ? `${((data.family.expenseCents / data.family.incomeCents) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das receitas` : "Gastos marcados como familiares"}
              onClick={() => navigate("familia")}
            />
            <Metric
              label="Saldo do mês"
              dark
              icon={<Activity size={17} />}
              value={<Money cents={data.family.balanceCents} />}
              foot={balanceFoot(data)}
              onClick={() => navigate("orcamento")}
            />
            <Metric
              label="Minhas pendências"
              icon={<Bell size={17} />}
              value={String(data.pendingCount).padStart(2, "0")}
              foot={data.pendingCount ? "Compras aguardando revisão" : "Tudo organizado por aqui"}
              onClick={() => openModal(<DigestModal />)}
            />
          </div>

          <div className="grid-2">
            <div className="stack">
              <Panel title="Evolução financeira" action={<LinkButton onClick={() => navigate("familia")}>Ver família</LinkButton>}>
                <div className="chart-head">
                  <div>
                    <div className="muted small">Receitas e despesas compartilhadas</div>
                    <div className="big">
                      <Money cents={data.family.expenseCents} />
                    </div>
                    <div className="muted small">Despesas familiares de {monthLabel(data.month).split(" ")[0]}</div>
                  </div>
                  <span className="chip green">↗ Visão mensal</span>
                </div>
                <IncomeExpenseBars series={data.familySeries} current={data.month} />
              </Panel>
              <Panel title="Minhas transações recentes" action={<LinkButton onClick={() => navigate("transacoes")}>Ver todas</LinkButton>}>
                {data.recent.length ? (
                  data.recent.map((t) => <TxRow key={t.id} t={t} />)
                ) : (
                  <p className="muted small">
                    Nenhuma transação ainda. Registre uma despesa ou <a href="#/contas">importe o extrato do banco</a>.
                  </p>
                )}
              </Panel>
            </div>
            <div className="stack">
              <Panel title="Para onde foi o dinheiro?" action={<LinkButton onClick={() => navigate("familia")}>Detalhes</LinkButton>}>
                <CategoryDonut categories={data.familyCategories} />
              </Panel>
              <Panel title="A Nia percebeu…" action={<LinkButton onClick={() => navigate("nia")}>Conversar</LinkButton>}>
                <div className="insights">
                  {data.insights.map((i) => (
                    <button
                      type="button"
                      key={i.id}
                      className="insight"
                      onClick={() => (i.id === "pending" ? openModal(<DigestModal />) : i.page ? navigate(i.page) : undefined)}
                    >
                      <span className="insight-ic">{i.icon}</span>
                      <div>
                        <h4>{i.title}</h4>
                        <p>{i.text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="split-heading">
            <h2>Seu próximo passo</h2>
          </div>
          <div className="banner">
            <div>
              <h2>Organizar ficou mais leve com a Nia. ✨</h2>
              <p>Converse por texto, fale uma compra (“gastei 80 no mercado”) ou revise suas pendências num lugar só.</p>
            </div>
            <button type="button" className="btn primary" onClick={() => navigate("nia")}>
              Abrir assistente <ChevronRight size={15} />
            </button>
          </div>
          <div className="footer-note">ninho. • seus detalhes são privados; a família vê só os totais que você compartilhar</div>
        </>
      )}
    </>
  );
}
