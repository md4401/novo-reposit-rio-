// Renda variável (autônomo, MEI, comissão): um salário fixo para si mesmo e um colchão para os meses fracos.
import { useState } from "react";
import type { IncomeOverview } from "../../shared/types";
import { ErrorBox, Heading, Money, Panel, Segmented, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { formatMoney, monthShort, parseMoney } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function IncomePage() {
  const { toast, refreshMe } = useApp();
  const { data, error, reload } = useData<IncomeOverview>("income");
  const [salary, setSalary] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api("me", { method: "PATCH", body });
      await refreshMe();
      setSalary("");
      toast(message);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = data?.selfSalaryCents ?? data?.suggestedCents ?? null;
  const last = data?.months.at(-1);
  return (
    <>
      <Heading title="Renda variável" subtitle="Para quem é autônomo, MEI ou ganha comissão: viva de um salário fixo e guarde a sobra dos meses bons." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="stack">
          <Panel>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Minha renda é</label>
              <Segmented
                value={data.mode}
                onChange={(m) => void save({ incomeMode: m }, m === "variable" ? "Renda variável: a reserva recomendada passa a 12 meses." : "Renda fixa.")}
                options={[
                  ["fixed", "Fixa (salário)"],
                  ["variable", "Variável"],
                ]}
              />
            </div>
          </Panel>
          <Panel title="Salário para mim mesmo">
            {data.suggestedCents === null ? (
              <p className="small muted">Preciso de pelo menos 3 meses de receitas lançadas ou importadas para sugerir um valor.</p>
            ) : (
              <p className="small">
                Nos últimos meses você recebeu em média <b>{formatMoney(data.averageCents)}</b>. Um salário que cabe em 3 de cada 4 meses seria{" "}
                <b>{formatMoney(data.suggestedCents)}</b>.
              </p>
            )}
            {current !== null && (
              <div className="setting-row" style={{ marginTop: 8 }}>
                <span>{data.selfSalaryCents ? "Salário escolhido" : "Salário sugerido"}</span>
                <Money cents={current} />
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input aria-label="Meu salário" inputMode="decimal" placeholder="Definir outro valor (R$)" value={salary} onChange={(e) => setSalary(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
              <button
                type="button"
                className="btn dark small"
                disabled={busy}
                onClick={() => {
                  const cents = parseMoney(salary);
                  if (!cents) return toast("Informe o valor");
                  void save({ selfSalaryCents: cents }, "Salário definido.");
                }}
              >
                {busy && <Spinner />} Salvar
              </button>
              {data.selfSalaryCents && (
                <button type="button" className="btn ghost small" disabled={busy} onClick={() => void save({ selfSalaryCents: null }, "Voltei a usar o valor sugerido.")}>
                  Usar o sugerido
                </button>
              )}
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Como funciona: todo mês, transfira só o salário para a conta do dia a dia. O que passar fica no colchão; num mês fraco, o colchão completa.
            </p>
          </Panel>
          {current !== null && data.months.length > 0 && (
            <Panel title="Como o colchão teria ficado">
              {data.months.map((m) => (
                <div key={m.month} className="setting-row">
                  <span>{monthShort(m.month)}</span>
                  <span className="small">
                    <Money cents={m.incomeCents} />{" "}
                    <span className={m.diffCents >= 0 ? "up" : "down"}>
                      ({m.diffCents >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(m.diffCents))})
                    </span>
                  </span>
                </div>
              ))}
              {last && (
                <p className="small" style={{ marginTop: 8 }}>
                  Colchão hoje: <b className={last.bufferCents >= 0 ? "up" : "down"}>{formatMoney(last.bufferCents)}</b>
                  {last.bufferCents < 0 ? " — o salário está alto para a sua renda; considere baixar." : "."}
                </p>
              )}
            </Panel>
          )}
          <Panel title="Impostos de quem trabalha por conta">
            <p className="small">
              Cadastre o <b>DAS do MEI</b> (dia 20), o <b>carnê-leão</b> ou o <b>INSS (GPS)</b> em “Contas a pagar” para receber o lembrete antes de vencer.
            </p>
            <button type="button" className="btn ghost small" style={{ marginTop: 8 }} onClick={() => navigate("pagar")}>
              Ir para Contas a pagar
            </button>
          </Panel>
        </div>
      )}
    </>
  );
}
