// Patrimônio (contas + bens + investimentos − dívidas) e plano para quitar dívidas.
import { FileText, Pencil, PieChart, Plus, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { Asset, Debt, DebtPlan, Wealth } from "../../shared/types";
import { Empty, ErrorBox, Heading, ModalHeader, Money, Panel, Segmented, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { centsToInput, monthShort, parseMoney } from "../lib/format";
import { navContext } from "../lib/nav";
import { navigate } from "../lib/router";
import { useData } from "../lib/useData";
import { useApp } from "../state";

const KIND: Record<Asset["kind"], string> = { investment: "📈 Investimento", property: "🏠 Imóvel", vehicle: "🚗 Veículo", other: "📦 Outro" };

function AssetModal({ asset }: { asset?: Asset }) {
  const { toast, closeModal } = useApp();
  const [name, setName] = useState(asset?.name ?? "");
  const [kind, setKind] = useState<Asset["kind"]>(asset?.kind ?? "investment");
  const [value, setValue] = useState(asset ? centsToInput(asset.valueCents) : "");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valueCents = parseMoney(value);
    if (valueCents === null || valueCents < 0) return toast("Informe o valor");
    setBusy(true);
    try {
      await api(asset ? `assets/${asset.id}` : "assets", { method: asset ? "PATCH" : "POST", body: { name, kind, valueCents } });
      toast("Patrimônio atualizado.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title={asset ? "Atualizar bem" : "Novo bem ou investimento"} subtitle="Ex.: CDB, Tesouro, poupança fora do banco, carro, casa." />
      <div className="field">
        <label htmlFor="as-name">Nome</label>
        <input id="as-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="as-kind">Tipo</label>
          <select id="as-kind" value={kind} onChange={(e) => setKind(e.target.value as Asset["kind"])}>
            {Object.entries(KIND).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="as-value">Valor hoje (R$)</label>
          <input id="as-value" required inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

function DebtModal({ debt }: { debt?: Debt }) {
  const { toast, closeModal } = useApp();
  const [name, setName] = useState(debt?.name ?? "");
  const [balance, setBalance] = useState(debt ? centsToInput(debt.balanceCents) : "");
  const [rate, setRate] = useState(debt ? String(debt.monthlyRatePercent).replace(".", ",") : "");
  const [min, setMin] = useState(debt ? centsToInput(debt.minPaymentCents) : "");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const balanceCents = parseMoney(balance);
    const monthlyRatePercent = Number((rate || "0").replace(",", "."));
    if (balanceCents === null || !Number.isFinite(monthlyRatePercent)) return toast("Confira saldo e juros");
    setBusy(true);
    try {
      await api(debt ? `debts/${debt.id}` : "debts", {
        method: debt ? "PATCH" : "POST",
        body: { name, balanceCents, monthlyRatePercent, minPaymentCents: parseMoney(min) ?? 0 },
      });
      toast("Dívida salva.");
      closeModal();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <ModalHeader title={debt ? "Atualizar dívida" : "Nova dívida"} subtitle="Empréstimo, financiamento, cheque especial, acordo…" />
      <div className="field">
        <label htmlFor="db-name">Nome</label>
        <input id="db-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-even" style={{ gap: 10, marginTop: 0 }}>
        <div className="field">
          <label htmlFor="db-bal">Quanto falta (R$)</label>
          <input id="db-bal" required inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="db-rate">Juros ao mês (%)</label>
          <input id="db-rate" inputMode="decimal" placeholder="Ex.: 2,5" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="db-min">Parcela mínima por mês (R$)</label>
        <input id="db-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button type="submit" className="btn dark" disabled={busy}>
          {busy && <Spinner />} Salvar
        </button>
      </div>
    </form>
  );
}

function months(n: number) {
  if (n < 12) return `${n} ${n === 1 ? "mês" : "meses"}`;
  const y = Math.floor(n / 12);
  const m = n % 12;
  return `${y} ano${y > 1 ? "s" : ""}${m ? ` e ${m} ${m === 1 ? "mês" : "meses"}` : ""}`;
}

function DebtPlanner({ hasDebts }: { hasDebts: boolean }) {
  const [extra, setExtra] = useState("200,00");
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");
  const extraCents = parseMoney(extra) ?? 0;
  const { data } = useData<DebtPlan>(hasDebts ? `debts/plan?extra=${extraCents}` : null);
  const plan = data?.[strategy];
  const other = data?.[strategy === "avalanche" ? "snowball" : "avalanche"];
  return (
    <Panel title="Plano para sair das dívidas">
      <div className="field">
        <label htmlFor="dp-extra">Quanto a mais por mês, além das parcelas mínimas?</label>
        <input id="dp-extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </div>
      <Segmented
        value={strategy}
        onChange={setStrategy}
        options={[
          ["avalanche", "Maior juro primeiro"],
          ["snowball", "Menor dívida primeiro"],
        ]}
      />
      {!plan ? (
        <Skeleton height={80} />
      ) : !plan.feasible ? (
        <div className="notice warn" style={{ marginTop: 12 }}>
          Com esse valor os juros crescem mais rápido do que você paga. Aumente o valor extra ou renegocie os juros.
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="budget-total">
            <span>Livre das dívidas em</span>
            <b>{months(plan.months)}</b>
          </div>
          <p className="muted small">
            Juros no caminho: <Money cents={plan.interestCents} />
            {other?.feasible && other.interestCents > plan.interestCents && (
              <>
                {" "}
                — <Money cents={other.interestCents - plan.interestCents} /> a menos que a outra estratégia
              </>
            )}
            .
          </p>
          <ol className="payoff-order">
            {plan.order.map((d) => (
              <li key={d.id}>
                <b>{d.name}</b> — quitada em {months(d.paidOffMonth)}
              </li>
            ))}
          </ol>
          <p className="muted small">
            {strategy === "avalanche" ? "Paga menos juros no total." : "Dá ânimo: você vê dívidas sumindo mais cedo."} Pague o mínimo de todas e o extra na primeira da lista.
          </p>
        </div>
      )}
    </Panel>
  );
}

export function WealthPage() {
  const { me, openModal, toast, confirm } = useApp();
  const { data, error, reload } = useData<Wealth>("wealth");
  // IR e Renda variável só viram abas quando fazem sentido; fora disso, atalhos aqui
  const ctx = navContext(me);
  const taxSeason = ctx ? ctx.month >= 2 && ctx.month <= 5 : false;

  async function remove(kind: "assets" | "debts", id: string, name: string) {
    if (!(await confirm({ title: `Apagar “${name}”?`, confirmLabel: "Apagar", danger: true }))) return;
    await api(`${kind}/${id}`, { method: "DELETE" });
    toast("Apagado.");
  }

  return (
    <>
      <Heading
        title="Patrimônio e dívidas"
        subtitle="Tudo o que você tem menos tudo o que deve — e como isso muda mês a mês. Só você vê."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => navigate("meu")}>
              <PieChart size={15} /> Meu mês
            </button>
            {!taxSeason && (
              <button type="button" className="btn ghost" onClick={() => navigate("ir")}>
                <FileText size={15} /> Imposto de Renda
              </button>
            )}
            {ctx?.incomeMode !== "variable" && (
              <button type="button" className="btn ghost" onClick={() => navigate("renda")}>
                <TrendingUp size={15} /> Renda variável
              </button>
            )}
          </>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? (
        <Skeleton height={260} />
      ) : (
        <>
          <div className="cards three" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="metric">
              <span className="cap">Tenho</span>
              <div className="val">
                <Money cents={data.assetsCents} />
              </div>
            </div>
            <div className="metric">
              <span className="cap">Devo</span>
              <div className="val">
                <Money cents={data.debtsCents} />
              </div>
            </div>
            <div className="metric dark-card">
              <span className="cap">Patrimônio</span>
              <div className="val">
                <Money cents={data.netWorthCents} />
              </div>
            </div>
          </div>
          {data.history.length > 1 && (
            <Panel title="Evolução">
              <div className="nw-history">
                {data.history.map((h) => (
                  <div key={h.month}>
                    <span>{monthShort(h.month)}</span>
                    <b className="num">
                      <Money cents={h.netWorthCents} />
                    </b>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          <div className="grid-2" style={{ marginTop: 0 }}>
            <Panel
              title="O que eu tenho"
              action={
                <button type="button" className="btn dark small" onClick={() => openModal(<AssetModal />)}>
                  <Plus size={14} /> Adicionar
                </button>
              }
            >
              <div className="setting-row">
                <div>
                  <h4>🏦 Saldo das contas</h4>
                  <p>Contas com saldo informado em “Bancos e cartões”</p>
                </div>
                <b className="num">
                  <Money cents={data.accountsCents} />
                </b>
              </div>
              {data.assets.map((a) => (
                <div className="setting-row" key={a.id}>
                  <div>
                    <h4>{a.name}</h4>
                    <p>{KIND[a.kind]}</p>
                  </div>
                  <div className="payable-actions">
                    <b className="num">
                      <Money cents={a.valueCents} />
                    </b>
                    <button type="button" className="icon-btn" aria-label={`Atualizar ${a.name}`} onClick={() => openModal(<AssetModal asset={a} />)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Apagar ${a.name}`} onClick={() => void remove("assets", a.id, a.name)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </Panel>
            <Panel
              title="O que eu devo"
              action={
                <button type="button" className="btn dark small" onClick={() => openModal(<DebtModal />)}>
                  <Plus size={14} /> Adicionar
                </button>
              }
            >
              <div className="setting-row">
                <div>
                  <h4>💳 Faturas do cartão</h4>
                  <p>Fechadas e a aberta (cartões com datas informadas)</p>
                </div>
                <b className="num">
                  <Money cents={data.cardsCents} />
                </b>
              </div>
              {data.debts.length === 0 && <Empty icon="🎉" title="Nenhuma dívida cadastrada" />}
              {data.debts.map((d) => (
                <div className="setting-row" key={d.id}>
                  <div>
                    <h4>{d.name}</h4>
                    <p>
                      {String(d.monthlyRatePercent).replace(".", ",")}% ao mês · mínimo <Money cents={d.minPaymentCents} />
                    </p>
                  </div>
                  <div className="payable-actions">
                    <b className="num">
                      <Money cents={d.balanceCents} />
                    </b>
                    <button type="button" className="icon-btn" aria-label={`Atualizar ${d.name}`} onClick={() => openModal(<DebtModal debt={d} />)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Apagar ${d.name}`} onClick={() => void remove("debts", d.id, d.name)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </Panel>
          </div>
          {data.debts.length > 0 && <DebtPlanner hasDebts />}
        </>
      )}
    </>
  );
}
