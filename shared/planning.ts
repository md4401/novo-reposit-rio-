// Planejamento: ciclo da fatura do cartão, próximas datas de contas, previsão de saldo,
// orçamento acumulado, quitação de dívidas e desafios. Funções puras (testes em tests/planning.test.ts).
import { addDays, addMonths, daysBetween, daysInMonth } from "./time.js";

const pad = (n: number) => String(n).padStart(2, "0");

/** Dia do mês ajustado para meses curtos (dia 31 em fevereiro → 28/29). */
export function dayIn(month: string, day: number) {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

export type Cycle = { closeMonth: string; start: string; closingOn: string; dueOn: string };

/** Fatura que fecha no mês `closeMonth`: compras de (fechamento anterior, fechamento]. */
export function cycleFor(closeMonth: string, closingDay: number, dueDay: number): Cycle {
  const closingOn = dayIn(closeMonth, closingDay);
  const start = addDays(dayIn(addMonths(closeMonth, -1), closingDay), 1);
  const dueMonth = dueDay > closingDay ? closeMonth : addMonths(closeMonth, 1);
  return { closeMonth, start, closingOn, dueOn: dayIn(dueMonth, dueDay) };
}

/** Fatura aberta hoje (a que recebe as compras de hoje). */
export function openCycle(today: string, closingDay: number, dueDay: number): Cycle {
  const month = today.slice(0, 7);
  return today <= dayIn(month, closingDay) ? cycleFor(month, closingDay, dueDay) : cycleFor(addMonths(month, 1), closingDay, dueDay);
}

/** Em qual fatura cai uma compra feita em `day`. */
export function cycleOf(day: string, closingDay: number, dueDay: number) {
  return openCycle(day, closingDay, dueDay);
}

export type Recurrence = "once" | "monthly" | "yearly";

/** Próximo vencimento depois de pagar o de `due`. */
export function nextDue(due: string, recurrence: Recurrence, originalDay = Number(due.slice(8, 10))): string | null {
  if (recurrence === "once") return null;
  const month = addMonths(due.slice(0, 7), recurrence === "monthly" ? 1 : 12);
  return dayIn(month, originalDay);
}

/** Datas de vencimento de `due` em diante, até `until` (inclusive). */
export function occurrences(due: string, recurrence: Recurrence, until: string, max = 24) {
  const days: string[] = [];
  const day = Number(due.slice(8, 10));
  let current: string | null = due;
  while (current && current <= until && days.length < max) {
    days.push(current);
    current = nextDue(current, recurrence, day);
  }
  return days;
}

/** Sazonal: quanto guardar por mês até o vencimento (arredonda para cima). */
export function monthlySaving(amountCents: number, today: string, dueOn: string) {
  const months = Math.max(1, (Number(dueOn.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(dueOn.slice(5, 7)) - Number(today.slice(5, 7)));
  return Math.ceil(amountCents / months);
}

export type ForecastEvent = { on: string; label: string; amountCents: number; kind: "bill" | "card" | "income" | "subscription" };
export type ForecastDay = { on: string; balanceCents: number };

/** Saldo dia a dia: saídas negativas, entradas positivas. */
export function forecast(startCents: number, today: string, days: number, events: ForecastEvent[]) {
  const end = addDays(today, days);
  const inWindow = events.filter((e) => e.on > today && e.on <= end).sort((a, b) => a.on.localeCompare(b.on));
  const series: ForecastDay[] = [];
  let balance = startCents;
  let lowest = { on: today, balanceCents: startCents };
  let firstNegative: string | null = startCents < 0 ? today : null;
  for (let i = 1; i <= days; i++) {
    const on = addDays(today, i);
    for (const e of inWindow) if (e.on === on) balance += e.amountCents;
    series.push({ on, balanceCents: balance });
    if (balance < lowest.balanceCents) lowest = { on, balanceCents: balance };
    if (balance < 0 && !firstNegative) firstNegative = on;
  }
  return { series, events: inWindow, lowest, firstNegative, endCents: balance };
}

/** Orçamento que acumula: soma do que sobrou (ou faltou) nos meses anteriores. */
export function rolloverCarry(limitCents: number, spentByMonth: { month: string; cents: number }[], fromMonth: string, month: string) {
  let carry = 0;
  for (let m = fromMonth; m < month; m = addMonths(m, 1)) {
    carry += limitCents - (spentByMonth.find((s) => s.month === m)?.cents ?? 0);
  }
  return carry;
}

export type DebtInput = { id: string; name: string; balanceCents: number; monthlyRateBp: number; minPaymentCents: number };
export type PayoffPlan = {
  strategy: "snowball" | "avalanche";
  months: number;
  interestCents: number;
  /** false quando o pagamento não cobre os juros (a dívida não acaba) */
  feasible: boolean;
  order: { id: string; name: string; paidOffMonth: number }[];
};

/** Quitação: paga o mínimo de todas e joga o extra na primeira da fila
 *  (snowball = menor saldo primeiro; avalanche = maior juro primeiro). */
export function payoffPlan(debts: DebtInput[], extraCents: number, strategy: "snowball" | "avalanche"): PayoffPlan {
  const items = debts.filter((d) => d.balanceCents > 0).map((d) => ({ ...d, balance: d.balanceCents, paidOffMonth: 0 }));
  const sorted = () =>
    items
      .filter((d) => d.balance > 0)
      .sort((a, b) => (strategy === "snowball" ? a.balance - b.balance || b.monthlyRateBp - a.monthlyRateBp : b.monthlyRateBp - a.monthlyRateBp || a.balance - b.balance));
  const budget = items.reduce((s, d) => s + d.minPaymentCents, 0) + Math.max(0, extraCents);
  let month = 0;
  let interest = 0;
  while (items.some((d) => d.balance > 0) && month < 600) {
    month++;
    for (const d of items) {
      if (d.balance <= 0) continue;
      const i = Math.round((d.balance * d.monthlyRateBp) / 10000);
      d.balance += i;
      interest += i;
    }
    let available = budget;
    // Mínimos primeiro, depois o que sobra vai para a primeira da fila
    for (const d of items) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, d.minPaymentCents, available);
      d.balance -= pay;
      available -= pay;
    }
    for (const d of sorted()) {
      if (available <= 0) break;
      const pay = Math.min(d.balance, available);
      d.balance -= pay;
      available -= pay;
    }
    for (const d of items) if (d.balance <= 0 && !d.paidOffMonth) d.paidOffMonth = month;
  }
  const feasible = items.every((d) => d.balance <= 0);
  return {
    strategy,
    months: feasible ? month : 0,
    interestCents: interest,
    feasible,
    order: items.filter((d) => d.paidOffMonth).sort((a, b) => a.paidOffMonth - b.paidOffMonth).map((d) => ({ id: d.id, name: d.name, paidOffMonth: d.paidOffMonth })),
  };
}

export type ChallengeKind = "no_delivery" | "organized" | "spend_less" | "no_spend_day";
export const CHALLENGES: Record<ChallengeKind, { title: string; icon: string; days: number; text: string }> = {
  no_delivery: { title: "Semana sem delivery", icon: "🛵", days: 7, text: "7 dias sem pedir comida por aplicativo (iFood, Rappi…)." },
  organized: { title: "7 dias organizado", icon: "✅", days: 7, text: "Termine cada dia sem compras esperando revisão." },
  spend_less: { title: "Gastar menos que no mês passado", icon: "📉", days: 30, text: "Até o fim do mês, gastar menos do que no mês anterior inteiro." },
  no_spend_day: { title: "3 dias sem gastar", icon: "🧘", days: 14, text: "Em 14 dias, ter pelo menos 3 dias sem nenhum gasto." },
};

const DELIVERY = /\b(ifood|i food|rappi|uber ?eats|james delivery|ze delivery|aiqfome|delivery)\b/i;

export type ChallengeTx = { occurredOn: string; description: string; amountCents: number; direction: string; status: string };

/** Progresso de um desafio: 0 a 1 e situação. */
export function challengeProgress(
  kind: ChallengeKind,
  startsOn: string,
  endsOn: string,
  today: string,
  txs: ChallengeTx[],
  extra: { previousMonthCents?: number; pendingAtEndOfDay?: Record<string, number> } = {},
): { progress: number; status: "active" | "won" | "lost"; detail: string } {
  const last = today < endsOn ? today : endsOn;
  const total = daysBetween(startsOn, endsOn) + 1;
  const elapsed = Math.max(0, Math.min(total, daysBetween(startsOn, last) + 1));
  const inRange = txs.filter((t) => t.occurredOn >= startsOn && t.occurredOn <= endsOn && t.direction === "expense");
  const finished = today > endsOn;
  if (kind === "no_delivery") {
    const hit = inRange.find((t) => DELIVERY.test(t.description));
    if (hit) return { progress: elapsed / total, status: "lost", detail: `Pedido em ${hit.occurredOn.slice(8, 10)}/${hit.occurredOn.slice(5, 7)}` };
    return { progress: elapsed / total, status: finished ? "won" : "active", detail: `${elapsed} de ${total} dias sem delivery` };
  }
  if (kind === "no_spend_day") {
    const spentDays = new Set(inRange.map((t) => t.occurredOn));
    let free = 0;
    for (let i = 0; i < elapsed; i++) if (!spentDays.has(addDays(startsOn, i))) free++;
    if (free >= 3) return { progress: 1, status: "won", detail: "3 dias sem gastar!" };
    return { progress: free / 3, status: finished ? "lost" : "active", detail: `${free} de 3 dias sem gastar` };
  }
  if (kind === "spend_less") {
    const spent = inRange.reduce((s, t) => s + t.amountCents, 0);
    const target = extra.previousMonthCents ?? 0;
    if (target <= 0) return { progress: 0, status: "active", detail: "Sem gastos no mês passado para comparar" };
    if (spent >= target) return { progress: 1, status: "lost", detail: "Passou do total do mês passado" };
    return { progress: elapsed / total, status: finished ? "won" : "active", detail: `${Math.round((spent / target) * 100)}% do mês passado` };
  }
  // organized: dias passados sem pendências ao fim do dia
  const pending = extra.pendingAtEndOfDay ?? {};
  let good = 0;
  for (let i = 0; i < elapsed; i++) {
    const day = addDays(startsOn, i);
    if (day >= today) break;
    if ((pending[day] ?? 0) > 0) return { progress: good / total, status: "lost", detail: `Ficaram pendências no dia ${day.slice(8, 10)}` };
    good++;
  }
  return { progress: good / total, status: finished ? "won" : "active", detail: `${good} de ${total} dias organizados` };
}
