import { Bot, Check, Repeat, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AlertsPayload, BankCosts, Loyalty, Recurring } from "../../shared/types";
import { Empty, ErrorBox, Heading, Metric, Money, Panel, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, monthLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";
import { CategoryBadge, Glyph } from "../components/icons";

function intervalText(r: Recurring) {
  if (r.installment) return `Parcela ${r.installment.n} de ${r.installment.of}`;
  if (r.intervalDays > 300) return `Anual · última em ${dayLabel(r.lastOn)}`;
  return `Todo dia ${Number(r.lastOn.slice(8, 10))}${r.nextExpectedOn ? ` · próxima ${dayLabel(r.nextExpectedOn)}` : ""}`;
}

function RecurringCard({ r }: { r: Recurring }) {
  const increase = r.previousAmountCents !== null && r.lastAmountCents - r.previousAmountCents >= 100 ? r.lastAmountCents - r.previousAmountCents : 0;
  return (
    <div className="sub-card">
      <CategoryBadge id={r.kind === "parcela" ? "outros" : r.categoryId} size={43} />
      <div>
        <h4>{r.label}</h4>
        <p>
          {r.kind === "conta" ? "Conta recorrente · " : ""}
          {intervalText(r)}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <b>
          <Money cents={r.lastAmountCents} />
        </b>
        <div style={{ marginTop: 4 }}>
          {increase ? (
            <span className="chip amber">
              Aumento de <Money cents={increase} />
            </span>
          ) : (
            <span className="chip green">{r.kind === "parcela" ? "Parcela" : "Estável"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Custo dos bancos e pontos: saíram das abas e ficam resumidos aqui, com atalho para os detalhes. */
function BanksAndPoints() {
  const { me } = useApp();
  const year = me?.today.slice(0, 4) ?? "";
  const costs = useData<BankCosts>(`bank-costs?year=${year}`);
  const points = useData<Loyalty[]>("loyalty");
  const expiring = (points.data ?? []).filter((p) => p.daysLeft !== null && p.daysLeft <= 60).length;
  return (
    <Panel title="Bancos e pontos">
      <div className="setting-row">
        <div>
          <h4>Custo dos bancos em {year}</h4>
          <p>Tarifas, juros, IOF, anuidade e multas</p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => navigate("bancos")}>
          {costs.data ? <Money cents={costs.data.totalCents} /> : "Ver"}
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h4>Benefícios e pontos</h4>
          <p>
            {!points.data?.length
              ? "Anote pontos, milhas e cashback para não perder"
              : `${points.data.length} programa(s)${expiring ? ` · ${expiring} vencendo em breve` : ""}`}
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => navigate("pontos")}>
          {points.data?.length ? "Ver" : "Anotar"}
        </button>
      </div>
    </Panel>
  );
}

export function AlertsPage() {
  const { toast } = useApp();
  const { data, error, reload } = useData<AlertsPayload>("alerts");

  async function dismiss(key: string) {
    await api("alerts/dismiss", { body: { key } });
    toast("Certo! Não vou mais avisar sobre isso.");
  }

  const duplicates = data?.alerts.filter((a) => a.type === "duplicate").length ?? 0;
  return (
    <>
      <Heading
        title="Assinaturas e alertas"
        subtitle="Acompanhe gastos que se repetem e revise mudanças inesperadas."
        actions={
          <button type="button" className="btn ghost" onClick={() => navigate("nia")}>
            <Bot size={15} /> Perguntar à Nia
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={300} />
      ) : (
        <>
          <div className="cards">
            <Metric label="Custos recorrentes" dark icon={<Repeat size={17} />} value={<Money cents={data.monthlyRecurringCents} />} foot="Estimativa por mês" />
            <Metric label="Assinaturas detectadas" icon={<Check size={17} />} value={String(data.recurring.length).padStart(2, "0")} foot="Cobranças sob acompanhamento" />
            <Metric label="Alertas importantes" icon={<TriangleAlert size={17} />} value={String(data.alerts.length - duplicates).padStart(2, "0")} foot="Aumentos e gastos fora do padrão" />
            <Metric label="Possíveis duplicidades" icon={<ShieldCheck size={17} />} value={String(duplicates).padStart(2, "0")} foot={duplicates ? "Confira no extrato" : "Nenhum caso recente"} />
          </div>
          <div className="grid-2">
            <div className="stack">
              <Panel title="Assinaturas e contas recorrentes">
                {data.recurring.length === 0 ? (
                  <Empty icon="🔄" title="Nada recorrente ainda" text="Cobranças que se repetem (streaming, academia, internet) aparecem depois de 2 ou 3 meses de extrato." />
                ) : (
                  data.recurring.map((r) => <RecurringCard key={r.merchant} r={r} />)
                )}
              </Panel>
              {data.installments.length > 0 && (
                <Panel title="Parcelas em andamento">
                  {data.installments.map((r) => (
                    <RecurringCard key={r.merchant} r={r} />
                  ))}
                  <p className="muted small">Parcelas não são assinaturas: terminam sozinhas.</p>
                </Panel>
              )}
            </div>
            <div className="stack">
              <Panel title={`Já comprometido em ${monthLabel(data.commitments.month).split(" ")[0]}`}>
                {data.commitments.items.length === 0 ? (
                  <p className="muted small">Nenhuma assinatura, conta fixa ou parcela prevista para o mês que vem.</p>
                ) : (
                  <>
                    <div className="budget-total">
                      <span>{data.commitments.items.length} previstos</span>
                      <b>
                        <Money cents={data.commitments.totalCents} />
                      </b>
                    </div>
                    {data.commitments.items.map((i, n) => (
                      <div className="setting-row" key={n}>
                        <div>
                          <h4>{i.label}</h4>
                          <p>
                            {i.kind === "parcela" ? "Parcela" : i.kind === "conta" ? "Conta" : "Assinatura"} · {dayLabel(i.on)}
                          </p>
                        </div>
                        <b className="num">
                          <Money cents={i.amountCents} />
                        </b>
                      </div>
                    ))}
                    <p className="muted small" style={{ marginTop: 8 }}>
                      Estimativa pelo valor da última cobrança. Use para planejar o orçamento do mês que vem.
                    </p>
                  </>
                )}
              </Panel>
              <Panel title="O que observar">
                {data.alerts.length === 0 ? (
                  <Empty icon="🎉" title="Nenhum alerta" text="Sem aumentos, duplicidades ou gastos muito fora do seu padrão." />
                ) : (
                  <div className="insights">
                    {data.alerts.map((a) => (
                      <div className="insight" key={a.key}>
                        <span className="insight-ic">
                          <Glyph emoji={a.type === "increase" ? "📈" : a.type === "duplicate" ? "🔁" : "⚠️"} />
                        </span>
                        <div style={{ flex: 1 }}>
                          <h4>{a.title}</h4>
                          <p>{a.text}</p>
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <button type="button" className="btn ghost small" onClick={() => dismiss(a.key)}>
                              <Check size={12} /> Está tudo certo
                            </button>
                            {a.transactionIds.length > 0 && (
                              <button type="button" className="btn ghost small" onClick={() => navigate(`transacoes?q=${encodeURIComponent(a.text.split(":")[0])}`)}>
                                Ver transações
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
                  Duplicidade é só uma suspeita: o ninho nunca apaga compras sozinho e não garante detectar fraudes.
                </p>
              </Panel>
              <BanksAndPoints />
              <div className="privacy-line" style={{ margin: 0 }}>
                <ShieldCheck size={18} />
                <div>
                  <strong>Alertas somente do seu perfil</strong>Ninguém da família consegue consultar suas assinaturas pessoais.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
