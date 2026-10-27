// Assinaturas, contas recorrentes, parcelas e alertas (aumento de preço, possível
// duplicidade e gasto fora do padrão). Funções puras sobre as transações de UMA pessoa;
// testadas em tests/insights.test.ts. Nada aqui apaga ou bloqueia transações.
import { formatMoney } from "../shared/money.js";
import { installmentOf } from "../shared/merchant.js";
import { addDays, addMonths, daysBetween, dayLabel, daysInMonth } from "../shared/time.js";
import type { Alert, Commitments, Recurring } from "../shared/types.js";

export type TxLite = {
  id: string;
  occurredOn: string;
  merchant: string;
  description: string;
  amountCents: number;
  direction: "expense" | "income" | "transfer";
  categoryId: string | null;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Cobrança mensal costuma cair no mesmo dia do mês (31/01 → 28/02). */
function sameDayNextMonth(key: string) {
  const month = addMonths(key.slice(0, 7), 1);
  const day = Math.min(Number(key.slice(8, 10)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

function titleCase(text: string) {
  return text.replace(/(^|\s)(\p{L})/gu, (_, space: string, c: string) => space + c.toUpperCase());
}

const BILL_CATEGORIES = new Set(["moradia", "saude", "educacao", "assinaturas"]);

export function detectRecurring(transactions: TxLite[], today: string): { recurring: Recurring[]; installments: Recurring[] } {
  const groups = new Map<string, TxLite[]>();
  for (const t of transactions) {
    if (t.direction !== "expense") continue;
    if (daysBetween(t.occurredOn, today) > 400) continue;
    const list = groups.get(t.merchant) ?? [];
    list.push(t);
    groups.set(t.merchant, list);
  }

  const recurring: Recurring[] = [];
  const installments: Recurring[] = [];
  for (const [merchant, list] of groups) {
    list.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const last = list[list.length - 1];
    const installment = installmentOf(last.description);
    if (installment) {
      installments.push({
        merchant,
        label: titleCase(merchant),
        categoryId: last.categoryId,
        kind: "parcela",
        intervalDays: 30,
        lastOn: last.occurredOn,
        nextExpectedOn: installment.n < installment.of ? addDays(last.occurredOn, 30) : null,
        lastAmountCents: last.amountCents,
        previousAmountCents: null,
        count: list.length,
        installment,
      });
      continue;
    }
    if (list.length < 2) continue;
    // Uma cobrança por período: ignora compras repetidas no mesmo dia/semana
    const gaps = list.slice(1).map((t, i) => daysBetween(list[i].occurredOn, t.occurredOn));
    const interval = median(gaps);
    const monthly = interval >= 26 && interval <= 35;
    const yearly = interval >= 350 && interval <= 380;
    if (!monthly && !yearly) continue;
    // Datas espaçadas de forma regular (no máximo uma fora do padrão)
    const irregular = gaps.filter((g) => Math.abs(g - interval) > 7).length;
    if (irregular > Math.max(0, Math.floor(gaps.length / 3))) continue;
    // Assinatura = preço fixo (até 2% de variação antes da última cobrança).
    // Conta = valor variável, mas de categoria de conta da casa (luz, água, plano de saúde...).
    // Compras comuns no mesmo estabelecimento todo mês não entram.
    const amounts = list.map((t) => t.amountCents);
    const prior = amounts.slice(-4, -1);
    const priorMid = median(prior);
    const priorStable = prior.every((a) => Math.abs(a - priorMid) / priorMid <= 0.02);
    const subscription = priorStable || last.categoryId === "assinaturas";
    const bill = !subscription && list.length >= 3 && BILL_CATEGORIES.has(last.categoryId ?? "");
    if (!subscription && !bill) continue;
    // Se parou de cobrar há muito tempo, não está mais ativa
    if (daysBetween(last.occurredOn, today) > interval * 1.8) continue;
    const previous = Math.round(priorMid);
    recurring.push({
      merchant,
      label: titleCase(merchant),
      categoryId: last.categoryId,
      kind: subscription ? "assinatura" : "conta",
      intervalDays: Math.round(interval),
      lastOn: last.occurredOn,
      nextExpectedOn: monthly ? sameDayNextMonth(last.occurredOn) : addDays(last.occurredOn, Math.round(interval)),
      lastAmountCents: last.amountCents,
      previousAmountCents: previous,
      count: list.length,
      installment: null,
    });
  }
  recurring.sort((a, b) => b.lastAmountCents - a.lastAmountCents);
  return { recurring, installments };
}

export function detectAlerts(transactions: TxLite[], recurring: Recurring[], today: string, dismissed: Set<string>): Alert[] {
  const alerts: Alert[] = [];

  // 1) Aumento de assinatura/conta recorrente
  for (const r of recurring) {
    if (r.kind !== "assinatura" || r.previousAmountCents === null) continue;
    const diff = r.lastAmountCents - r.previousAmountCents;
    if (diff >= 100 && diff / r.previousAmountCents >= 0.03) {
      const key = `increase:${r.merchant}:${r.lastOn}`;
      if (dismissed.has(key)) continue;
      alerts.push({
        key,
        type: "increase",
        title: `Aumento em ${r.label}`,
        text: `Passou de ${formatMoney(r.previousAmountCents)} para ${formatMoney(r.lastAmountCents)} (+${formatMoney(diff)}).`,
        transactionIds: [],
      });
    }
  }

  // 2) Possível duplicidade: mesmo estabelecimento e valor em até 2 dias. Só um aviso:
  // duas compras reais parecidas nunca são apagadas automaticamente.
  const recent = transactions
    .filter((t) => t.direction === "expense" && daysBetween(t.occurredOn, today) <= 60)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i];
      const b = recent[j];
      if (daysBetween(a.occurredOn, b.occurredOn) > 2) break;
      if (a.merchant !== b.merchant || a.amountCents !== b.amountCents) continue;
      const key = `duplicate:${a.id}:${b.id}`;
      if (dismissed.has(key)) continue;
      alerts.push({
        key,
        type: "duplicate",
        title: "Possível cobrança duplicada",
        text: `${titleCase(a.merchant)}: duas cobranças de ${formatMoney(a.amountCents)} (${dayLabel(a.occurredOn)} e ${dayLabel(b.occurredOn)}). Confira no extrato.`,
        transactionIds: [a.id, b.id],
      });
    }
  }

  // 3) Gasto fora do padrão: comparado ao histórico do mesmo estabelecimento ou,
  // se for um lugar novo, ao da categoria (últimos 30 dias contra os 180 anteriores).
  const byMerchant = new Map<string, number[]>();
  const byCategory = new Map<string, number[]>();
  for (const t of transactions) {
    if (t.direction !== "expense") continue;
    const age = daysBetween(t.occurredOn, today);
    if (age <= 30 || age > 210) continue;
    byMerchant.set(t.merchant, [...(byMerchant.get(t.merchant) ?? []), t.amountCents]);
    if (t.categoryId) byCategory.set(t.categoryId, [...(byCategory.get(t.categoryId) ?? []), t.amountCents]);
  }
  for (const t of transactions) {
    if (t.direction !== "expense" || daysBetween(t.occurredOn, today) > 30) continue;
    const own = byMerchant.get(t.merchant);
    let reference: number | null = null;
    if (own && own.length >= 3) {
      const med = median(own);
      if (t.amountCents >= 10_000 && t.amountCents > 3 * med) reference = med;
    } else if (t.categoryId) {
      const history = byCategory.get(t.categoryId);
      if (history && history.length >= 5) {
        const sorted = [...history].sort((a, b) => a - b);
        const med = median(sorted);
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        if (t.amountCents >= 30_000 && t.amountCents > Math.max(5 * med, 2 * p90)) reference = med;
      }
    }
    if (reference === null) continue;
    const key = `unusual:${t.id}`;
    if (dismissed.has(key)) continue;
    alerts.push({
      key,
      type: "unusual",
      title: "Gasto acima do seu padrão",
      text: `${titleCase(t.merchant)}: ${formatMoney(t.amountCents)} em ${dayLabel(t.occurredOn)}. Normalmente esse tipo de gasto fica perto de ${formatMoney(Math.round(reference))}.`,
      transactionIds: [t.id],
    });
  }
  return alerts;
}

/** Custo mensal estimado das recorrências (anuais divididas por 12). */
export function monthlyRecurringCents(recurring: Recurring[]) {
  return recurring.reduce((sum, r) => sum + (r.intervalDays > 300 ? Math.round(r.lastAmountCents / 12) : r.lastAmountCents), 0);
}

function sameDayIn(month: string, key: string) {
  return `${month}-${String(Math.min(Number(key.slice(8, 10)), daysInMonth(month))).padStart(2, "0")}`;
}

/** Contas que já estão "contratadas" para o mês que vem: assinaturas e contas mensais ainda ativas,
 *  anuais que vencem no mês e a próxima parcela de cada compra parcelada. */
export function nextMonthCommitments(recurring: Recurring[], installments: Recurring[], today: string): Commitments {
  const month = addMonths(today.slice(0, 7), 1);
  const items: Commitments["items"] = [];
  for (const r of recurring) {
    const monthly = r.intervalDays <= 35;
    if (monthly) {
      if (daysBetween(r.lastOn, today) > 45) continue; // parou de cobrar
      items.push({ label: r.label, amountCents: r.lastAmountCents, kind: r.kind, on: sameDayIn(month, r.lastOn) });
    } else if (r.nextExpectedOn?.startsWith(month)) {
      items.push({ label: r.label, amountCents: r.lastAmountCents, kind: r.kind, on: r.nextExpectedOn });
    }
  }
  for (const p of installments) {
    if (!p.installment || p.installment.n >= p.installment.of) continue;
    if (daysBetween(p.lastOn, today) > 45) continue;
    items.push({
      label: `${p.label} (parcela ${p.installment.n + 1}/${p.installment.of})`,
      amountCents: p.lastAmountCents,
      kind: "parcela",
      on: sameDayIn(month, p.lastOn),
    });
  }
  items.sort((a, b) => a.on.localeCompare(b.on));
  return { month, totalCents: items.reduce((s, i) => s + i.amountCents, 0), items };
}
