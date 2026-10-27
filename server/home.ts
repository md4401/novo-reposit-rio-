// Regras da tela inicial que não dependem do banco (testadas em tests/home.test.ts):
// a agenda dos próximos dias e a separação entre o que precisa de ação e as dicas.
import { addDays } from "../shared/time.js";
import type { CardInvoice, HouseBill, Insight, Payable, Recurring, UpcomingItem } from "../shared/types.js";
import { INSIGHT_PRIORITY, rankInsights } from "./insights.js";

/**
 * O que vence ou entra nos próximos `days` dias, só da própria pessoa: contas a pagar
 * (inclusive as atrasadas), fatura do cartão, assinaturas previstas e a parte dela nas
 * contas da casa ainda não paga. Nunca entra a parte de outra pessoa.
 */
export function buildUpcoming(input: {
  today: string;
  days?: number;
  payables: Payable[];
  invoices: CardInvoice[];
  recurring: Recurring[];
  bills: HouseBill[];
  limit?: number;
}): UpcomingItem[] {
  const { today, payables, invoices, recurring, bills } = input;
  const until = addDays(today, input.days ?? 7);
  const items: UpcomingItem[] = [];

  for (const p of payables)
    if (p.dueOn <= until) items.push({ on: p.dueOn, label: p.name, amountCents: p.amountCents, kind: "bill", overdue: p.dueOn < today, page: "pagar" });

  for (const inv of invoices)
    if (inv.status !== "future" && inv.totalCents > 0 && inv.dueOn >= today && inv.dueOn <= until)
      items.push({ on: inv.dueOn, label: `Fatura ${inv.accountName}`, amountCents: inv.totalCents, kind: "card", overdue: false, page: "pagar" });

  // Assinaturas e contas mensais detectadas no extrato (parcelas já entram na fatura)
  for (const r of recurring)
    if (r.kind !== "parcela" && r.intervalDays <= 35 && r.nextExpectedOn && r.nextExpectedOn >= today && r.nextExpectedOn <= until)
      items.push({ on: r.nextExpectedOn, label: r.label, amountCents: r.lastAmountCents, kind: "subscription", overdue: false, page: "alertas" });

  for (const b of bills) {
    const mine = b.shares.find((s) => s.isMe && !s.paid);
    if (mine && b.dueOn <= until)
      items.push({ on: b.dueOn, label: `${b.name} (sua parte)`, amountCents: mine.amountCents, kind: "house", overdue: b.dueOn < today, page: "casa" });
  }

  return items.sort((a, b) => a.on.localeCompare(b.on) || b.amountCents - a.amountCents).slice(0, input.limit ?? 6);
}

/**
 * Divide os avisos em "precisa de você" (alertas com ação, mais urgentes primeiro, até 4)
 * e dicas (até 2). O aviso de privacidade só entra nas dicas quando não há outra.
 */
export function splitInsights(ranked: { item: Insight; priority: number }[]) {
  const actions = rankInsights(
    ranked.filter((r) => r.priority < INSIGHT_PRIORITY.info),
    4,
  );
  const tips = rankInsights(
    ranked.filter((r) => r.priority >= INSIGHT_PRIORITY.info),
    2,
  ).slice(0, Math.max(1, ranked.filter((r) => r.priority === INSIGHT_PRIORITY.info).length));
  return { actions, tips };
}
