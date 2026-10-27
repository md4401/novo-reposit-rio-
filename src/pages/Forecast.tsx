// Saldo previsto: saldo das contas + contas a pagar, faturas, assinaturas e salário dos próximos dias.
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ForecastPayload } from "../../shared/types";
import { ErrorBox, Heading, Money, Panel, Segmented, Skeleton } from "../components/ui";
import { dayLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

function ForecastChart({ data }: { data: ForecastPayload }) {
  const { hidden } = useApp();
  const points = [{ on: "", balanceCents: data.startCents }, ...data.series];
  const values = points.map((p) => p.balanceCents);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = (v: number) => 92 - ((v - min) / span) * 84;
  const line = points.map((p, i) => `${(i / (points.length - 1)) * 100},${y(p.balanceCents)}`).join(" ");
  return (
    <svg className="forecast-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Saldo previsto dia a dia">
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="zero" vectorEffect="non-scaling-stroke" />
      {!hidden && <polyline points={line} fill="none" className="line" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function ForecastPage() {
  const [days, setDays] = useState<"30" | "60" | "90">("30");
  const { data, error, reload } = useData<ForecastPayload>(`forecast?days=${days}`);
  return (
    <>
      <Heading title="Saldo previsto" subtitle="Quanto vai sobrar na conta nos próximos dias, com o que já está combinado." />
      <Segmented value={days} onChange={setDays} options={[["30", "30 dias"], ["60", "60 dias"], ["90", "90 dias"]]} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={260} />
      ) : (
        <>
          {!data.knownBalance && (
            <button type="button" className="notice info compact" style={{ width: "100%", textAlign: "left", margin: "12px 0" }} onClick={() => navigate("contas")}>
              <TriangleAlert size={16} />
              <span>
                A previsão começa em R$ 0: <b>informe o saldo da sua conta</b> em Bancos e cartões para ficar exata.
              </span>
            </button>
          )}
          {data.firstNegative && (
            <div className="notice warn" style={{ margin: "12px 0" }}>
              <TriangleAlert size={18} />
              <div>
                <h3>Atenção: o saldo fica negativo em {dayLabel(data.firstNegative)}</h3>
                <p>
                  O ponto mais baixo é <Money cents={data.lowest.balanceCents} /> em {dayLabel(data.lowest.on)}. Antecipe uma entrada ou adie um gasto.
                </p>
              </div>
            </div>
          )}
          <div className="cards three" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="metric">
              <span className="cap">Hoje</span>
              <div className="val">
                <Money cents={data.startCents} />
              </div>
            </div>
            <div className="metric">
              <span className="cap">Mais baixo</span>
              <div className="val">
                <Money cents={data.lowest.balanceCents} className={data.lowest.balanceCents < 0 ? "down" : ""} />
              </div>
            </div>
            <div className="metric dark-card">
              <span className="cap">Em {days} dias</span>
              <div className="val">
                <Money cents={data.endCents} />
              </div>
            </div>
          </div>
          <Panel title="Dia a dia">
            <ForecastChart data={data} />
          </Panel>
          <Panel title="O que entra e sai">
            {data.events.length === 0 && <p className="muted small">Nada previsto. Cadastre contas a pagar e o dia de vencimento do cartão.</p>}
            {data.events.map((e, i) => (
              <div className="setting-row" key={i}>
                <div>
                  <h4>
                    {e.kind === "income" ? "💰" : e.kind === "card" ? "💳" : e.kind === "subscription" ? "🔄" : "📅"} {e.label}
                  </h4>
                  <p>{dayLabel(e.on)}</p>
                </div>
                <b className={`num ${e.amountCents > 0 ? "up" : ""}`}>
                  <Money cents={Math.abs(e.amountCents)} sign={e.amountCents > 0 ? "+" : "-"} />
                </b>
              </div>
            ))}
          </Panel>
        </>
      )}
    </>
  );
}
