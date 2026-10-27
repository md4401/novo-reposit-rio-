// Quanto os bancos custaram no ano: tarifas, juros, IOF, anuidade e multas (pela descrição do extrato).
import { useState } from "react";
import { FEE_LABEL } from "../../shared/bank-fees";
import type { BankCosts } from "../../shared/types";
import { Empty, ErrorBox, Heading, Money, Panel, Skeleton } from "../components/ui";
import { dayLabel, formatMoney } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

const TIPS: Record<string, string> = {
  tarifa: "Pergunte ao banco pelos serviços essenciais gratuitos (Resolução do Banco Central) ou troque por uma conta digital sem tarifa.",
  juros: "Juros de cheque especial e rotativo estão entre os mais caros do país. Trocar por um empréstimo pessoal mais barato costuma valer a pena — veja o plano em Patrimônio e dívidas.",
  iof: "IOF aparece em compras internacionais e no cheque especial. Para viagens, compare com conta global.",
  anuidade: "Peça isenção da anuidade: muitos bancos aceitam negociar, ainda mais com o cartão em dia.",
  multa: "Multas e encargos vêm de atrasos. Cadastre as contas em “Contas a pagar” para receber o lembrete antes.",
};

export function BankCostsPage() {
  const { me } = useApp();
  const thisYear = Number(me?.today.slice(0, 4) ?? new Date().getFullYear());
  const [year, setYear] = useState(thisYear);
  const { data, error, reload } = useData<BankCosts>(`bank-costs?year=${year}`);
  return (
    <>
      <Heading
        title="Quanto os bancos custaram"
        subtitle="Tarifas, juros, IOF, anuidade e multas encontrados nos seus lançamentos."
        actions={
          <select aria-label="Ano" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : data.totalCents === 0 ? (
        <Panel>
          <Empty icon="🏦" title="Nenhum custo de banco encontrado" text="Importe os extratos do ano: o ninho procura tarifas, juros, IOF, anuidade e multas." />
        </Panel>
      ) : (
        <div className="stack">
          <Panel>
            <p className="small muted">Em {year} você pagou aos bancos</p>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
              <Money cents={data.totalCents} />
            </div>
            <p className="small muted">Cerca de {formatMoney(Math.round(data.totalCents / 12))} por mês.</p>
          </Panel>
          <Panel title="Por tipo">
            {data.byKind.map((k) => (
              <div key={k.kind} className="setting-row">
                <div>
                  <h4>{FEE_LABEL[k.kind]}</h4>
                  <p>{TIPS[k.kind]}</p>
                </div>
                <Money cents={k.cents} />
              </div>
            ))}
          </Panel>
          {data.byAccount.length > 1 && (
            <Panel title="Por conta">
              {data.byAccount.map((a) => (
                <div key={a.name} className="setting-row">
                  <span>{a.name}</span>
                  <Money cents={a.cents} />
                </div>
              ))}
            </Panel>
          )}
          <Panel title="Lançamentos">
            {data.items.map((i, n) => (
              <div key={n} className="setting-row">
                <div style={{ minWidth: 0 }}>
                  <h4>{i.description}</h4>
                  <p>
                    {dayLabel(i.occurredOn)}
                    {i.accountName ? ` · ${i.accountName}` : ""}
                  </p>
                </div>
                <Money cents={i.amountCents} />
              </div>
            ))}
          </Panel>
        </div>
      )}
    </>
  );
}
