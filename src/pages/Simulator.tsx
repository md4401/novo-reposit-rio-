// Grandes momentos: bebê, mudança, casamento, carro, faculdade, aposentadoria — o impacto no mês e quanto guardar.
import { useState } from "react";
import { monthlyToReach } from "../../shared/installments";
import type { PlanBase } from "../../shared/types";
import { Heading, Panel, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { centsToInput, formatMoney, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

type Moment = { key: string; icon: string; name: string; oneTime: number; monthly: number; months: number; hint: string };
// Valores iniciais são só um ponto de partida: a família ajusta com a realidade dela
const MOMENTS: Moment[] = [
  { key: "bebe", icon: "👶", name: "Bebê chegando", oneTime: 800000, monthly: 150000, months: 9, hint: "Enxoval, parto/plano, fraldas, leite, creche ou babá." },
  { key: "mudanca", icon: "📦", name: "Mudança de casa", oneTime: 600000, monthly: 0, months: 6, hint: "Caução ou entrada, frete, móveis, diferença de aluguel e condomínio." },
  { key: "casamento", icon: "💍", name: "Casamento", oneTime: 3000000, monthly: 0, months: 18, hint: "Festa, roupas, documentos, viagem." },
  { key: "carro", icon: "🚗", name: "Carro", oneTime: 1500000, monthly: 90000, months: 24, hint: "Entrada; por mês: seguro, IPVA, combustível e manutenção." },
  { key: "faculdade", icon: "🎓", name: "Faculdade", oneTime: 0, monthly: 120000, months: 12, hint: "Mensalidade, material e transporte." },
  { key: "viagem", icon: "✈️", name: "Viagem em família", oneTime: 1200000, monthly: 0, months: 10, hint: "Passagens, hospedagem, passeios." },
];

function money(v: string) {
  return parseMoney(v) ?? 0;
}

export function SimulatorPage() {
  const { toast } = useApp();
  const { data: base } = useData<PlanBase>("plan-base");
  const [pick, setPick] = useState<Moment>(MOMENTS[0]);
  const [oneTime, setOneTime] = useState(centsToInput(MOMENTS[0].oneTime));
  const [monthly, setMonthly] = useState(centsToInput(MOMENTS[0].monthly));
  const [months, setMonths] = useState(String(MOMENTS[0].months));
  const [busy, setBusy] = useState(false);
  // Aposentadoria
  const [age, setAge] = useState("35");
  const [retireAt, setRetireAt] = useState("65");
  const [wanted, setWanted] = useState("4.000,00");
  const [saved, setSaved] = useState("0");

  function choose(m: Moment) {
    setPick(m);
    setOneTime(centsToInput(m.oneTime));
    setMonthly(centsToInput(m.monthly));
    setMonths(String(m.months));
  }

  const nMonths = Math.max(1, Number(months) || 1);
  const saveMonthly = monthlyToReach(money(oneTime), nMonths, 0.008);
  const free = base ? base.incomeCents - base.expenseCents : 0;
  const after = free - money(monthly);

  // Aposentadoria: juro real ~0,4% ao mês; renda de 0,4% ao mês sobre o acumulado (sem consumir o principal)
  const years = Math.max(1, (Number(retireAt) || 65) - (Number(age) || 35));
  const target = Math.round(money(wanted) / 0.004);
  const retireMonthly = monthlyToReach(target, years * 12, 0.004, money(saved));

  async function makeGoal() {
    setBusy(true);
    try {
      await api("goals", { body: { name: pick.name, targetCents: money(oneTime), scope: "family", icon: pick.icon } });
      toast("Meta criada! Acompanhe em Metas e objetivos.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading title="Grandes momentos" subtitle="Simule o impacto antes de acontecer. Os valores são um ponto de partida: ajuste com a sua realidade." />
      <div className="stack">
        <Panel>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {MOMENTS.map((m) => (
              <button key={m.key} type="button" className={`btn small ${pick.key === m.key ? "primary" : "ghost"}`} onClick={() => choose(m)}>
                {m.icon} {m.name}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            {pick.hint}
          </p>
          <div className="grid-even" style={{ gap: 10 }}>
            <div className="field">
              <label htmlFor="sm-one">Gasto de uma vez (R$)</label>
              <input id="sm-one" inputMode="decimal" value={oneTime} onChange={(e) => setOneTime(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sm-month">Gasto novo por mês (R$)</label>
              <input id="sm-month" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="sm-months">Daqui a quantos meses</label>
            <input id="sm-months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
        </Panel>
        <Panel title="O que muda">
          {money(oneTime) > 0 && (
            <p className="small">
              Para juntar <b>{formatMoney(money(oneTime))}</b> em {nMonths} meses, guarde cerca de <b>{formatMoney(saveMonthly)}</b> por mês.
            </p>
          )}
          {base && base.incomeCents > 0 ? (
            <p className="small" style={{ marginTop: 8 }}>
              Hoje sobram em média <b>{formatMoney(free)}</b> por mês.{" "}
              {money(monthly) > 0 && (
                <>
                  Com o gasto novo, passariam a sobrar <b className={after < 0 ? "down" : "up"}>{formatMoney(after)}</b>
                  {after < 0 ? " — vai faltar: dá para cortar algo antes de chegar a hora?" : "."}
                </>
              )}
            </p>
          ) : (
            <p className="small muted" style={{ marginTop: 8 }}>
              Lance ou importe alguns meses de receitas e despesas para ver o impacto no seu mês.
            </p>
          )}
          {money(oneTime) > 0 && (
            <button type="button" className="btn dark small" style={{ marginTop: 10 }} disabled={busy} onClick={() => void makeGoal()}>
              {busy && <Spinner />} Criar meta da família
            </button>
          )}
        </Panel>
        <Panel title="🏖️ Aposentadoria">
          <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
            <div className="field">
              <label htmlFor="rt-age">Idade hoje</label>
              <input id="rt-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rt-at">Parar aos</label>
              <input id="rt-at" inputMode="numeric" value={retireAt} onChange={(e) => setRetireAt(e.target.value)} />
            </div>
          </div>
          <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
            <div className="field">
              <label htmlFor="rt-want">Renda por mês, além do INSS (R$)</label>
              <input id="rt-want" inputMode="decimal" value={wanted} onChange={(e) => setWanted(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rt-saved">Já guardado (R$)</label>
              <input id="rt-saved" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
            </div>
          </div>
          <p className="small">
            Para viver de {formatMoney(money(wanted))} por mês sem gastar o principal, você precisaria de cerca de <b>{formatMoney(target)}</b>. Guardando{" "}
            <b>{formatMoney(retireMonthly)}</b> por mês pelos próximos {years} anos você chega lá.
          </p>
          <p className="small muted" style={{ marginTop: 6 }}>
            Conta simplificada, com rendimento acima da inflação de cerca de 0,4% ao mês. Começar cedo faz muita diferença.
          </p>
        </Panel>
      </div>
    </>
  );
}
