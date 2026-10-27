import { Activity, ArrowLeftRight, Copy, PiggyBank, Receipt, Share2, ShieldCheck, Target, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import type { Family } from "../../shared/types";
import { CategoryBars, IncomeExpenseBars } from "../components/charts";
import { Avatar, ErrorBox, Heading, LinkButton, Metric, Money, Panel, PeriodControl, Progress, Skeleton } from "../components/ui";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function inviteText(code: string) {
  return `Vamos organizar as finanças da casa no ninho.? Cada um vê só os próprios detalhes; a família vê os totais. Entre em ${window.location.origin} → Criar conta → "Entrar numa família" e use o código ${code}.`;
}

export function FamilyPage() {
  const { me, toast } = useApp();
  const today = me?.today.slice(0, 7) ?? "";
  const [month, setMonth] = useState(today);
  const { data, error, reload } = useData<Family>(`family?month=${month}`);
  const realMembers = me?.household.members.filter((m) => !m.isDemo).length ?? 1;

  return (
    <>
      <Heading
        title="Nossa família"
        subtitle="O que importa para a casa, sem expor as finanças individuais."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => navigate("casa")}>
              <Receipt size={15} /> Contas da casa
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate("orcamento")}>
              <PiggyBank size={15} /> Orçamento da casa
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate("saude")}>
              <Activity size={15} /> Saúde dos dados
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
          {data.dataWarning && (
            <div className="notice warn" style={{ marginBottom: 16 }}>
              <TriangleAlert size={18} />
              <div>
                <h3>Indicadores possivelmente incompletos</h3>
                <p>Alguma conta da família está sem atualização há mais de 7 dias. Por privacidade, não mostramos de quem nem qual banco.</p>
              </div>
            </div>
          )}
          <div className="family-top">
            <div>
              <div className="eyebrow" style={{ color: "#bce2bd" }}>
                Visão compartilhada · {me?.household.name}
              </div>
              <h2>
                Uma casa mais organizada
                <br />
                começa com clareza.
              </h2>
              <p>Receitas, despesas e metas da família. Nenhum extrato individual, loja ou nome de comprador é compartilhado nesta área.</p>
              <div className="members">
                {data.members.map((m, i) => (
                  <span className="member-pill" key={i}>
                    <Avatar name={m.name} color={m.avatarColor} />
                    {m.name}
                    {m.isDemo ? " (exemplo)" : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="family-balance">
              <div className="small">Saldo familiar do mês</div>
              <strong>
                <Money cents={data.totals.balanceCents} />
              </strong>
              <div className="small">
                <Money cents={data.totals.incomeCents} /> de receitas • <Money cents={data.totals.expenseCents} /> de gastos
              </div>
            </div>
          </div>

          {realMembers === 1 && me && (
            <div className="notice info" style={{ marginTop: 16 }}>
              <Share2 size={18} />
              <div style={{ flex: 1 }}>
                <h3>Convide sua família</h3>
                <p>
                  Cada pessoa cria a própria conta com o código <b className="num">{me.household.inviteCode}</b>. Os detalhes de cada um continuam privados.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <a className="btn primary small" href={`https://wa.me/?text=${encodeURIComponent(inviteText(me.household.inviteCode))}`} target="_blank" rel="noreferrer">
                    <Share2 size={13} /> Enviar pelo WhatsApp
                  </a>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      void navigator.clipboard?.writeText(me.household.inviteCode);
                      toast("Código copiado.");
                    }}
                  >
                    <Copy size={13} /> Copiar código
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="cards" style={{ marginTop: 17 }}>
            <Metric label="Receita compartilhada" icon={<Wallet size={17} />} value={<Money cents={data.totals.incomeCents} />} foot="Total do período" />
            <Metric label="Gastos da casa" icon={<ArrowLeftRight size={17} />} value={<Money cents={data.totals.expenseCents} />} foot="Todas as categorias" />
            <Metric
              label="Taxa de economia"
              icon={<Activity size={17} />}
              value={data.savingsRate === null ? "—" : `${(data.savingsRate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
              foot="Saldo ÷ receitas do mês"
            />
            <Metric label="Metas compartilhadas" icon={<Target size={17} />} value={String(data.goals.length).padStart(2, "0")} foot="Objetivos acompanhados" onClick={() => navigate("metas")} />
          </div>

          <div className="grid-2">
            <div className="stack">
              <Panel title="Despesas por categoria">
                <CategoryBars categories={data.categories} />
              </Panel>
              <Panel title="Evolução da casa">
                <IncomeExpenseBars series={data.series} current={data.month} />
              </Panel>
            </div>
            <div className="stack">
              <Panel title="Metas da família" action={<LinkButton onClick={() => navigate("metas")}>Ver metas</LinkButton>}>
                {data.goals.length === 0 && <p className="muted small">Nenhuma meta da família ainda.</p>}
                {data.goals.map((g) => (
                  <div key={g.id} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                      <b>
                        {g.icon} {g.name}
                      </b>
                      <span className="muted">{Math.min(100, Math.round((g.savedCents / g.targetCents) * 100))}%</span>
                    </div>
                    <Progress value={g.savedCents / g.targetCents} />
                  </div>
                ))}
              </Panel>
              <div className="privacy-line" style={{ marginTop: 0 }}>
                <ShieldCheck size={20} />
                <div>
                  <strong>Resumo sem detalhes individuais</strong>
                  Somamos só o que cada pessoa marcou como familiar. Não exibimos quem comprou, os estabelecimentos, comprovantes nem históricos particulares.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
