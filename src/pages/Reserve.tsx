// Reserva de emergência: quantos meses de custo essencial a família aguenta sem renda.
import { useEffect, useState } from "react";
import type { ReserveStatus } from "../../shared/types";
import { ErrorBox, Heading, Money, Panel, Progress, Skeleton, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function ReservePage() {
  const { toast } = useApp();
  const { data, error, reload } = useData<ReserveStatus>("reserve");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => setChosen(new Set((data?.items ?? []).filter((i) => i.isReserve).map((i) => i.id))), [data]);

  async function toggle(id: string, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
    const items = data?.items ?? [];
    try {
      await api("reserve", {
        method: "PUT",
        body: {
          accountIds: items.filter((i) => i.kind === "account" && next.has(i.id)).map((i) => i.id),
          assetIds: items.filter((i) => i.kind === "asset" && next.has(i.id)).map((i) => i.id),
        },
      });
    } catch (err) {
      toast((err as Error).message);
    }
  }

  const missing = data ? Math.max(0, data.targetCents - data.reserveCents) : 0;
  return (
    <>
      <Heading title="Reserva de emergência" subtitle="Dinheiro guardado para perda de emprego, doença ou conserto urgente — sem precisar de empréstimo." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          <Panel>
            {data.essentialCents === 0 ? (
              <p className="small muted">
                Ainda não há gastos suficientes para calcular. Lance ou importe pelo menos um mês de moradia, mercado, saúde e transporte.
              </p>
            ) : (
              <>
                <p className="small muted">Sua reserva cobre</p>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
                  {data.months.toLocaleString("pt-BR")} {data.months === 1 ? "mês" : "meses"}
                </div>
                <p className="small" style={{ marginBottom: 10 }}>
                  de {data.targetMonths} recomendados{data.targetMonths === 12 ? " para renda variável" : ""}.
                </p>
                <Progress value={data.targetMonths ? data.months / data.targetMonths : 0} tone="lime" />
                <div className="setting-row" style={{ marginTop: 12 }}>
                  <span>Custo essencial por mês</span>
                  <Money cents={data.essentialCents} />
                </div>
                <div className="setting-row">
                  <span>Guardado na reserva</span>
                  <Money cents={data.reserveCents} />
                </div>
                <div className="setting-row">
                  <span>Meta ({data.targetMonths} meses)</span>
                  <Money cents={data.targetCents} />
                </div>
                {missing > 0 && (
                  <p className="small" style={{ marginTop: 10 }}>
                    Faltam <b>{formatMoney(missing)}</b>. Guardando {formatMoney(Math.ceil(missing / 12 / 100) * 100)} por mês, você chega lá em um ano.
                  </p>
                )}
              </>
            )}
          </Panel>
          <Panel title="O que conta como reserva">
            <p className="small muted" style={{ marginBottom: 8 }}>
              Marque as contas e investimentos que são para emergência. O ideal é algo seguro e que você saca no mesmo dia (Tesouro Selic, CDB de liquidez diária,
              conta remunerada).
            </p>
            {data.items.length === 0 && <p className="small muted">Cadastre suas contas em “Contas e extratos” e investimentos em “Patrimônio e dívidas”.</p>}
            {data.items.map((i) => (
              <div key={i.id} className="setting-row">
                <div>
                  <h4>{i.name}</h4>
                  <p>
                    {i.kind === "asset" ? "Investimento" : "Conta"} · {formatMoney(i.cents)}
                  </p>
                </div>
                <Toggle on={chosen.has(i.id)} onChange={(v) => void toggle(i.id, v)} label={`${i.name} faz parte da reserva`} />
              </div>
            ))}
          </Panel>
        </div>
      )}
    </>
  );
}
