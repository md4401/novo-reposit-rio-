// Acompanhar alguém (com autorização dela): totais do mês, contas a pagar e alertas de golpe. Nunca compras.
import type { GuardianSummary } from "../../shared/types";
import { ErrorBox, Heading, Money, Panel, Skeleton } from "../components/ui";
import { dayLabel, formatMoney, monthLabel } from "../lib/format";
import { useData } from "../lib/useData";

export function GuardianPage({ id }: { id: string }) {
  const { data, error, reload } = useData<GuardianSummary>(`guardians/${id}/summary`);
  return (
    <>
      <Heading title={data ? `Acompanhando ${data.name}` : "Acompanhar"} subtitle="Só totais, contas a pagar e alertas de golpe — as compras continuam privadas." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          <Panel title={monthLabel(data.month)}>
            <div className="setting-row">
              <span>Entrou</span>
              <Money cents={data.incomeCents} />
            </div>
            <div className="setting-row">
              <span>Saiu</span>
              <Money cents={data.expenseCents} />
            </div>
            {data.previousExpenseCents > 0 && (
              <p className="small muted">No mês passado inteiro saíram {formatMoney(data.previousExpenseCents)}.</p>
            )}
            {data.pendingCount > 0 && <p className="small">{data.pendingCount} compra(s) esperando revisão.</p>}
          </Panel>
          <Panel title={data.alerts.length ? "⚠️ Alertas de golpe" : "Nenhum alerta de golpe ✅"}>
            {data.alerts.map((a, i) => (
              <div key={i} className="setting-row">
                <div>
                  <h4>{dayLabel(a.occurredOn)}</h4>
                  <p>{a.reason}</p>
                </div>
                <Money cents={a.amountCents} />
              </div>
            ))}
            {data.alerts.length > 0 && <p className="small">Ligue para {data.name} e confira com calma, sem julgamento.</p>}
          </Panel>
          <Panel title="Contas para pagar">
            {data.bills.length === 0 && <p className="small muted">Nada vencendo nos próximos dias.</p>}
            {data.bills.map((b) => (
              <div key={b.name + b.dueOn} className="setting-row">
                <div>
                  <h4>{b.name}</h4>
                  <p className={b.status === "overdue" ? "down" : undefined}>
                    {b.status === "overdue" ? "venceu" : "vence"} {dayLabel(b.dueOn)}
                  </p>
                </div>
                <Money cents={b.amountCents} />
              </div>
            ))}
          </Panel>
        </div>
      )}
    </>
  );
}
