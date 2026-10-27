// Imposto de Renda: despesas dedutíveis do ano (saúde e educação) e resumo em PDF.
import { Download, Info } from "lucide-react";
import { useState } from "react";
import type { TaxReport } from "../../shared/types";
import { Empty, ErrorBox, Heading, Money, Panel, Progress, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function TaxPage() {
  const { me, toast } = useApp();
  const thisYear = Number((me?.today ?? new Date().toISOString()).slice(0, 4));
  // Até abril, o mais útil é o ano anterior (a declaração é feita em março–maio)
  const [year, setYear] = useState(Number((me?.today ?? "").slice(5, 7)) <= 5 ? thisYear - 1 : thisYear);
  const { data, error, reload } = useData<TaxReport>(`tax?year=${year}`);
  const [busy, setBusy] = useState(false);

  async function pdf() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("report/link", { body: { type: "tax", year }, silent: true });
      window.location.href = url;
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        title="Imposto de Renda"
        subtitle="Suas despesas que podem ser deduzidas, organizadas para a declaração."
        actions={
          <>
            <select aria-label="Ano" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "auto" }}>
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" className="btn dark" disabled={busy || !data?.items.length} onClick={() => void pdf()}>
              {busy ? <Spinner /> : <Download size={15} />} Baixar PDF
            </button>
          </>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton />
      ) : (
        <>
          <div className="cards three" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="metric">
              <span className="cap">🩺 Saúde</span>
              <div className="val">
                <Money cents={data.totals.saude} />
              </div>
              <div className="foot">Sem limite de dedução</div>
            </div>
            <div className="metric">
              <span className="cap">🎓 Educação</span>
              <div className="val">
                <Money cents={data.totals.educacao} />
              </div>
              <Progress value={data.totals.educacao / data.educationLimitCents} tone={data.totals.educacao > data.educationLimitCents ? "warn" : undefined} />
              <div className="foot">
                Limite de referência: <Money cents={data.educationLimitCents} /> por pessoa
              </div>
            </div>
            <div className="metric dark-card">
              <span className="cap">Outras marcadas</span>
              <div className="val">
                <Money cents={data.totals.outros} />
              </div>
            </div>
          </div>
          <div className="notice info" style={{ marginBottom: 14 }}>
            <Info size={18} />
            <div>
              Saúde e educação entram sozinhas. Em qualquer compra, em <b>Organizar compra → Imposto de Renda</b>, dá para marcar ou tirar. Guarde os
              recibos: a declaração pede o CPF/CNPJ de quem recebeu. Confira as regras da Receita do ano antes de declarar.
            </div>
          </div>
          <Panel title={`Despesas dedutíveis de ${year}`}>
            {data.items.length === 0 ? (
              <Empty icon="🧾" title="Nada por aqui ainda" text="Consultas, exames, plano de saúde, escola e faculdade aparecem aqui." />
            ) : (
              data.items.map((i, n) => (
                <div className="setting-row" key={n}>
                  <div style={{ minWidth: 0 }}>
                    <h4>{i.description}</h4>
                    <p>
                      {dayLabel(i.occurredOn)} · {i.kind === "saude" ? "Saúde" : i.kind === "educacao" ? "Educação" : "Marcada por você"}
                    </p>
                  </div>
                  <b className="num">
                    <Money cents={i.amountCents} />
                  </b>
                </div>
              ))
            )}
          </Panel>
        </>
      )}
    </>
  );
}
