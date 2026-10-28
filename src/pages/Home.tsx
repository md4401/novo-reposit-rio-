// Tela inicial: como está o mês, o que precisa de você e o que vem por aí — nessa ordem.
import { CalendarClock, CircleCheck, CreditCard, FileText, House, Repeat, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Insight, Overview, UpcomingItem } from "../../shared/types";
import { CategoryDonut } from "../components/charts";
import { BalanceHelp, LeftoverHelp } from "../components/help";
import { GettingStarted } from "../components/GettingStarted";
import { Glyph } from "../components/icons";
import { TxRow } from "../components/TxRow";
import { DemoFlag, ErrorBox, Heading, LinkButton, Money, Panel, Progress, Segmented, Skeleton } from "../components/ui";
import { addMonths, monthLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { introJustFinished } from "../lib/intro";
import { DigestModal } from "../modals/DigestModal";
import { MonthReportModal } from "../modals/MonthReportModal";
import { useApp } from "../state";

type View = "me" | "home";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const monthName = (month: string) => capitalize(monthLabel(month).split(" ")[0]);

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

/** "Terça-feira, 27 de outubro" a partir de AAAA-MM-DD (sem fuso: é o dia da pessoa). */
function longDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return capitalize(new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
}

/** "Hoje", "Amanhã" ou "Qui, 30". */
function dayChip(on: string, today: string) {
  if (on === today) return "Hoje";
  const [y, m, d] = on.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((date.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (diff === 1) return "Amanhã";
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${capitalize(weekday)}, ${d}`;
}

// A escolha Eu/Casa fica no aparelho
const VIEW_KEY = "ninho.home.view";
function readView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "me" || v === "home" ? v : null;
  } catch {
    return null;
  }
}
function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

export function HomePage() {
  const { me } = useApp();
  const { data, error, reload } = useData<Overview>("overview");
  const realMembers = me?.household.members.filter((m) => !m.isDemo).length ?? 1;
  // Padrão: a casa quando há mais gente de verdade na família; senão, só você
  const [view, setView] = useState<View>(() => readView() ?? (realMembers > 1 ? "home" : "me"));
  const first = me?.profile.name.split(" ")[0] ?? "";

  const changeView = (v: View) => {
    setView(v);
    saveView(v);
  };

  return (
    <>
      <Heading eyebrow={me ? longDate(me.today) : undefined} title={`${greeting()}, ${first}`} />
      <DemoFlag />
      <GettingStarted />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <div className="home-cols">
          <div className="home-col">
            <Skeleton height={230} />
          </div>
          <div className="home-col">
            <Skeleton height={230} />
          </div>
        </div>
      ) : (
        <div className="home-cols">
          <div className="home-col">
            <MonthCard data={data} view={view} onView={changeView} />
            <Panel title="Para onde foi o dinheiro?" className="home-donut" action={<LinkButton onClick={() => navigate(view === "home" ? "familia" : "meu")}>Detalhes</LinkButton>}>
              <CategoryDonut categories={view === "home" ? data.familyCategories : data.mineCategories} />
              <p className="muted small home-scope">{view === "home" ? "Só o que cada um marcou como familiar." : "Suas compras, pessoais e familiares."}</p>
            </Panel>
            <Panel title="Últimas transações" className="home-recent" action={<LinkButton onClick={() => navigate("transacoes")}>Ver todas</LinkButton>}>
              {data.recent.length ? (
                data.recent.slice(0, 5).map((t) => <TxRow key={t.id} t={t} />)
              ) : (
                <p className="muted small">Nenhuma transação ainda. Toque em + para lançar uma despesa ou importar o extrato do banco.</p>
              )}
            </Panel>
          </div>
          <div className="home-col">
            <ActionsPanel data={data} />
            <UpcomingPanel items={data.upcoming} today={me?.today ?? data.month} />
            {data.tips.length > 0 && <TipsPanel tips={data.tips} />}
          </div>
        </div>
      )}
    </>
  );
}

/** Logo depois da abertura, o valor do mês conta de zero até o número (uma vez). */
function CountUp({ cents }: { cents: number }) {
  const [shown, setShown] = useState(() => (introJustFinished() ? 0 : cents));
  useEffect(() => {
    if (shown === cents) return;
    const from = shown;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 750);
      setShown(Math.round(from + (cents - from) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return <Money cents={shown} />;
}

/** "Seu mês": quanto saiu, entrou e sobrou, na visão escolhida. */
function MonthCard({ data, view, onView }: { data: Overview; view: View; onView: (v: View) => void }) {
  const { openModal } = useApp();
  const t = view === "home" ? data.family : data.mine;
  const previous = t.previousExpenseCents;
  const ratio = previous > 0 ? t.expenseCents / previous : null;
  const b = data.budgets;
  return (
    <section className="month-card" aria-label="Seu mês">
      <div className="month-head">
        <div>
          <span className="month-eyebrow">{monthName(data.month)}</span>
          <h2>{view === "home" ? "O mês da casa" : "Seu mês"}</h2>
        </div>
        <Segmented<View>
          value={view}
          onChange={onView}
          options={[
            ["me", "Eu"],
            ["home", "Casa"],
          ]}
        />
      </div>

      <div className="month-main">
        <span>Saiu</span>
        <b className="num">
          <CountUp cents={t.expenseCents} />
        </b>
      </div>
      {ratio !== null && (
        <div className="month-compare">
          <Progress value={Math.min(1, ratio)} tone={ratio > 1 ? "warn" : "lime"} />
          <span>
            {ratio > 1 ? (
              <>
                Já passou <Money cents={t.expenseCents - previous} /> de {monthLabel(addMonths(data.month, -1)).split(" ")[0]} inteiro
              </>
            ) : (
              <>
                {Math.round(ratio * 100)}% do que saiu em {monthLabel(addMonths(data.month, -1)).split(" ")[0]} (<Money cents={previous} />)
              </>
            )}
          </span>
        </div>
      )}

      <div className="month-row">
        <div>
          <span>Entrou</span>
          <b className="up">
            <Money cents={t.incomeCents} />
          </b>
        </div>
        <div>
          <span>
            Sobrou <LeftoverHelp />
          </span>
          <b className={t.balanceCents < 0 ? "down-light" : ""}>
            <Money cents={t.balanceCents} />
          </b>
        </div>
        {view === "me" && data.forecastEndOfMonthCents !== null && (
          <div>
            <span>
              Saldo previsto no fim do mês <BalanceHelp />
            </span>
            <b className={data.forecastEndOfMonthCents < 0 ? "down-light" : ""}>
              <Money cents={data.forecastEndOfMonthCents} />
            </b>
          </div>
        )}
      </div>

      <div className="month-foot">
        {b.total > 0 ? (
          <button type="button" className="month-chip" onClick={() => navigate("orcamento")}>
            {b.over > 0 ? `${b.over} categoria${b.over > 1 ? "s" : ""} acima do orçamento` : b.near > 0 ? `${b.near} perto do limite` : "Dentro do orçamento"}
          </button>
        ) : (
          <button type="button" className="month-chip" onClick={() => navigate("orcamento")}>
            Definir um orçamento
          </button>
        )}
        <button type="button" className="month-link" onClick={() => openModal(<MonthReportModal month={data.month} />)}>
          <FileText size={14} /> Relatório do mês
        </button>
      </div>
    </section>
  );
}

/** "Precisa de você": no máximo 4 ações, a mais urgente primeiro. */
function ActionsPanel({ data }: { data: Overview }) {
  const { openModal } = useApp();
  const act = (a: Insight) => {
    if (a.id === "pending") openModal(<DigestModal />);
    else if (a.id === "closing" && data.closingMonth) openModal(<MonthReportModal month={data.closingMonth} />);
    else if (a.page) navigate(a.page);
  };
  return (
    <Panel title="Precisa de você" className="home-actions">
      {data.actions.length === 0 ? (
        <div className="all-good">
          <CircleCheck size={20} />
          <div>
            <h4>Tudo em dia</h4>
            <p>Nada esperando por você agora.</p>
          </div>
        </div>
      ) : (
        <div className="action-list">
          {data.actions.map((a) => (
            <button type="button" key={a.id} className="action-row" onClick={() => act(a)}>
              <span className="insight-ic">
                <Glyph emoji={a.icon} />
              </span>
              <span className="action-text">
                <b>{a.title}</b>
                <small>{a.text}</small>
              </span>
              <span className="action-cta">{a.cta ?? "Ver"}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

const UPCOMING_ICON: Record<UpcomingItem["kind"], ReactNode> = {
  bill: <CalendarClock size={16} />,
  card: <CreditCard size={16} />,
  subscription: <Repeat size={16} />,
  house: <House size={16} />,
};

/** Agenda dos próximos 7 dias (só o que é seu). */
function UpcomingPanel({ items, today }: { items: UpcomingItem[]; today: string }) {
  return (
    <Panel title="Próximos 7 dias" className="home-upcoming" action={<LinkButton onClick={() => navigate("pagar")}>Contas a pagar</LinkButton>}>
      {items.length === 0 ? (
        <p className="muted small">Nada vencendo nos próximos 7 dias.</p>
      ) : (
        <div className="upcoming-list">
          {items.map((u) => (
            <button type="button" key={`${u.kind}-${u.on}-${u.label}`} className="upcoming-row" onClick={() => navigate(u.page)}>
              <span className={`day-chip ${u.overdue ? "late" : u.on === today ? "today" : ""}`}>{u.overdue ? "Atrasada" : dayChip(u.on, today)}</span>
              <span className="upcoming-ic">{UPCOMING_ICON[u.kind]}</span>
              <span className="upcoming-label">{u.label}</span>
              <b className="num">
                <Money cents={u.amountCents} />
              </b>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TipsPanel({ tips }: { tips: Insight[] }) {
  return (
    <Panel title="Dicas" className="home-tips">
      <div className="insights">
        {tips.map((i) => {
          const body = (
            <>
              <span className="insight-ic">
                <Glyph emoji={i.icon} />
              </span>
              <div>
                <h4>{i.title}</h4>
                <p>{i.text}</p>
              </div>
            </>
          );
          return i.page ? (
            <button type="button" key={i.id} className="insight" onClick={() => navigate(i.page!)}>
              {body}
              <ChevronRight size={15} className="muted" style={{ marginLeft: "auto", alignSelf: "center" }} />
            </button>
          ) : (
            <div key={i.id} className="insight">
              {body}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
