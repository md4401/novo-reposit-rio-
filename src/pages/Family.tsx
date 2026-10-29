import { Activity, ArrowLeftRight, CalendarCheck, Copy, Gift, PiggyBank, Receipt, Share2, ShieldCheck, Target, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import type { Allowance, Family } from "../../shared/types";
import { CategoryBars, IncomeExpenseBars } from "../components/charts";
import { Avatar, ErrorBox, Heading, LinkButton, Metric, Money, Panel, PeriodControl, Progress, Skeleton } from "../components/ui";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { AllowanceModal } from "../modals/AllowanceModal";
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
        title="Resumo da casa"
        subtitle="O que importa para a casa, sem expor as finanças individuais."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => navigate("reuniao")}>
              <CalendarCheck size={15} /> Reunião do mês
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate("casa")}>
              <Receipt size={15} /> Contas divididas
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate("orcamento")}>
              <PiggyBank size={15} /> Orçamento da casa
            </button>
            <button type="button" className="btn ghost" onClick={() => navigate("desejos")}>
              <Gift size={15} /> Desejos
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
              <p>
                Receitas, despesas e metas da família. Entram aqui só os totais do que cada pessoa marca como Família — nenhum extrato
                individual, loja ou nome de comprador. Atualiza sozinho quando alguém lança.
              </p>
              {me?.profile.defaultScope === "personal" && (
                <p className="small" style={{ marginTop: 6 }}>
                  Suas despesas novas estão entrando como Pessoal.{" "}
                  <button type="button" className="link" style={{ color: "inherit", textDecoration: "underline" }} onClick={() => navigate("ajustes?aba=privacidade")}>
                    Mudar
                  </button>
                </p>
              )}
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
            <Metric label="Metas compartilhadas" icon={<Target size={17} />} value={String(data.goals.length)} foot="Objetivos acompanhados" onClick={() => navigate("metas")} />
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
      <AllowancePanel />
    </>
  );
}

/** Mesada: quem administra define; quem recebe vê o valor e o limite de gastos do mês. */
function AllowancePanel() {
  const { me, openModal } = useApp();
  const { data } = useData<Allowance[]>("allowances");
  if (!me || !data) return null;
  const admin = me.profile.role === "admin";
  const mine = data.find((a) => a.isMe);
  const others = me.household.members.filter((m) => !m.isDemo && !m.isMe);
  if (!admin && !mine) return null;
  const when = (a: Allowance) => (a.frequency === "monthly" ? `todo dia ${a.payDay}` : `toda ${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][a.payDay]}`);
  return (
    <Panel title="🪙 Mesada">
      {mine && (
        <div className="budget-row">
          <div className="budget-top">
            <span className="budget-name">
              Sua mesada: <Money cents={mine.amountCents} /> {when(mine)}
            </span>
          </div>
          {mine.limitCents && (
            <>
              <Progress value={(mine.spentThisMonthCents ?? 0) / mine.limitCents} tone={(mine.spentThisMonthCents ?? 0) >= mine.limitCents * 0.8 ? "warn" : undefined} />
              <div className="budget-foot">
                <span>
                  Gastou <Money cents={mine.spentThisMonthCents ?? 0} /> de <Money cents={mine.limitCents} /> no mês
                </span>
              </div>
            </>
          )}
        </div>
      )}
      {admin &&
        (others.length === 0 ? (
          <p className="muted small">Quando outra pessoa entrar na família, você pode definir uma mesada para ela.</p>
        ) : (
          others.map((m) => {
            const a = data.find((x) => x.memberId === m.id);
            return (
              <div className="setting-row" key={m.id}>
                <div>
                  <h4>{m.name}</h4>
                  <p>{a ? <><Money cents={a.amountCents} /> {when(a)}{a.limitCents ? <> · limite <Money cents={a.limitCents} /></> : null}</> : "Sem mesada"}</p>
                </div>
                <button type="button" className="btn ghost small" onClick={() => openModal(<AllowanceModal member={m} current={a} />)}>
                  {a ? "Alterar" : "Definir mesada"}
                </button>
              </div>
            );
          })
        ))}
    </Panel>
  );
}
