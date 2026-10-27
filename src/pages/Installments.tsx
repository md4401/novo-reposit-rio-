// Parcelar ou pagar à vista? Mostra o juro escondido e quanto as parcelas já pesam na renda.
import { useState } from "react";
import { compareInstallments } from "../../shared/installments";
import type { PlanBase } from "../../shared/types";
import { Heading, Panel, Progress } from "../components/ui";
import { formatMoney, parseMoney } from "../lib/format";
import { useData } from "../lib/useData";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function InstallmentsPage() {
  const { data: base } = useData<PlanBase>("plan-base");
  const [cash, setCash] = useState("");
  const [n, setN] = useState("10");
  const [installment, setInstallment] = useState("");
  const [rate, setRate] = useState("0,8");
  const [firstNow, setFirstNow] = useState(false);
  const cashCents = parseMoney(cash) ?? 0;
  const count = Math.max(1, Math.min(72, Number(n) || 1));
  const instCents = parseMoney(installment) ?? 0;
  const savings = (Number(rate.replace(",", ".")) || 0) / 100;
  const ready = cashCents > 0 && instCents > 0;
  const v = ready ? compareInstallments(cashCents, instCents, count, savings, firstNow) : null;

  return (
    <>
      <Heading title="Parcelar ou à vista?" subtitle="Descubra o juro escondido no parcelado e se vale mais a pena guardar o dinheiro e parcelar." />
      <div className="stack">
        <Panel>
          <div className="field">
            <label htmlFor="ip-cash">Preço à vista (com desconto, se houver)</label>
            <input id="ip-cash" inputMode="decimal" placeholder="Ex.: 1.800,00" value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
          <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
            <div className="field">
              <label htmlFor="ip-n">Parcelas</label>
              <input id="ip-n" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ip-inst">Valor de cada parcela</label>
              <input id="ip-inst" inputMode="decimal" placeholder="Ex.: 200,00" value={installment} onChange={(e) => setInstallment(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ip-rate">Quanto seu dinheiro rende guardado (% ao mês)</label>
            <input id="ip-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            <span className="hint">Um investimento de liquidez diária costuma render perto de 0,8% ao mês. Poupança, menos.</span>
          </div>
          <label className="check-line">
            <input type="checkbox" checked={firstNow} onChange={(e) => setFirstNow(e.target.checked)} />
            <span>A primeira parcela é paga na hora (1 + {count - 1})</span>
          </label>
        </Panel>
        {v && (
          <Panel title={v.best === "vista" ? "👉 Pague à vista" : v.best === "parcelado" ? "👉 Parcele e deixe o dinheiro rendendo" : "🤝 Tanto faz"}>
            <div className="setting-row">
              <span>Total parcelado</span>
              <b>{formatMoney(v.totalCents)}</b>
            </div>
            <div className="setting-row">
              <span>Diferença para o à vista</span>
              <b className={v.extraCents > 0 ? "down" : undefined}>{formatMoney(v.extraCents)}</b>
            </div>
            <div className="setting-row">
              <span>Juro escondido</span>
              <b>
                {pct(v.monthlyRate)} ao mês ({pct(v.yearlyRate)} ao ano)
              </b>
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              {v.best === "vista"
                ? `O parcelado embute juro maior do que seu dinheiro rende. Se tiver o valor sem mexer na reserva, pagar à vista economiza.`
                : v.best === "parcelado"
                  ? `Guardando os ${formatMoney(cashCents)} e pagando as parcelas, o rendimento cobre a diferença.`
                  : "A diferença é pequena: escolha o que deixa o mês mais tranquilo."}
            </p>
          </Panel>
        )}
        {base && base.incomeCents > 0 && (
          <Panel title="Quanto as parcelas já pesam">
            <p className="small">
              No mês que vem você já tem <b>{formatMoney(base.installmentsCents)}</b> em parcelas — {Math.round(base.installmentsRatio * 100)}% da sua renda média (
              {formatMoney(base.incomeCents)}).
            </p>
            <div style={{ margin: "10px 0" }}>
              <Progress value={Math.min(1, base.installmentsRatio / 0.3)} tone={base.installmentsRatio >= 0.3 ? "warn" : "lime"} />
            </div>
            <p className="small muted">
              {base.installmentsRatio >= 0.3
                ? "Passou do teto de 30%: evite novas parcelas até algumas terminarem."
                : `Até o teto de 30% ainda cabem ${formatMoney(Math.max(0, Math.round(base.incomeCents * 0.3) - base.installmentsCents))} por mês em parcelas.`}
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}
