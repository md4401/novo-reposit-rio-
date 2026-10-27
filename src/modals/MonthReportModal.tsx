// Fechamento do mês: "seu mês em 5 números" e o relatório em PDF.
import { Download } from "lucide-react";
import { useState } from "react";
import type { MonthReport } from "../../shared/types";
import { ModalHeader, Money, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { category, monthLabel } from "../lib/format";
import { useData } from "../lib/useData";
import { useApp } from "../state";

export function MonthReportModal({ month }: { month: string }) {
  const { toast } = useApp();
  const { data, error } = useData<MonthReport>(`report?month=${month}`);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      // Link de uso único: no APK o Android entrega o download ao navegador
      const { url } = await api<{ url: string }>("report/link", { body: { month }, silent: true });
      window.location.href = url;
      toast("Baixando o PDF…");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = monthLabel(month);
  const diff = data && data.previousExpenseCents ? Math.round(((data.totals.expenseCents - data.previousExpenseCents) / data.previousExpenseCents) * 100) : null;
  const top = data?.categories[0];
  return (
    <>
      <ModalHeader title="Seu mês em 5 números" subtitle={`${label.charAt(0).toUpperCase()}${label.slice(1)}. Só você vê este relatório.`} />
      {error && <p className="form-error">{error}</p>}
      {!data ? (
        <Spinner />
      ) : (
        <div className="report-numbers">
          <div>
            <span>Entradas</span>
            <b>
              <Money cents={data.totals.incomeCents} />
            </b>
          </div>
          <div>
            <span>Gastos</span>
            <b>
              <Money cents={data.totals.expenseCents} />
            </b>
            {diff !== null && <small className={diff > 0 ? "down" : "up"}>{`${diff > 0 ? "+" : ""}${diff}% vs. mês anterior`}</small>}
          </div>
          <div>
            <span>Sobrou</span>
            <b>
              <Money cents={data.totals.balanceCents} />
            </b>
          </div>
          <div>
            <span>Maior categoria</span>
            <b>{top ? category(top.categoryId).name : "—"}</b>
            {top && (
              <small>
                <Money cents={top.cents} />
              </small>
            )}
          </div>
          <div>
            <span>Orçamento</span>
            <b>{data.budgets.total ? `${data.budgets.total - data.budgets.over} de ${data.budgets.total} no limite` : "Sem orçamento"}</b>
            {!data.budgets.total && <small>Defina em “Orçamento”</small>}
          </div>
        </div>
      )}
      {data && data.goals.length > 0 && (
        <p className="muted small" style={{ marginTop: 12 }}>
          Metas: {data.goals.slice(0, 3).map((g) => `${g.icon} ${g.name} ${Math.min(100, Math.round((g.savedCents / g.targetCents) * 100))}%`).join(" · ")}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn primary" disabled={busy || !data} onClick={download}>
          {busy ? <Spinner size={14} /> : <Download size={15} />} Baixar PDF
        </button>
      </div>
    </>
  );
}
