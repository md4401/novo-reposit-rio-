import { describe, expect, it } from "vitest";
import { challengeProgress, cycleFor, forecast, monthlySaving, nextDue, occurrences, openCycle, payoffPlan, rolloverCarry } from "../shared/planning";

describe("fatura do cartão", () => {
  it("compra antes do fechamento cai na fatura do mês; depois, na do mês seguinte", () => {
    expect(openCycle("2026-10-05", 8, 15)).toEqual({ closeMonth: "2026-10", start: "2026-09-09", closingOn: "2026-10-08", dueOn: "2026-10-15" });
    expect(openCycle("2026-10-09", 8, 15).closingOn).toBe("2026-11-08");
  });
  it("vencimento antes do dia de fechamento vence no mês seguinte", () => {
    expect(cycleFor("2026-10", 28, 5).dueOn).toBe("2026-11-05");
  });
  it("dia 31 em fevereiro vira o último dia do mês", () => {
    expect(cycleFor("2027-02", 31, 10)).toMatchObject({ closingOn: "2027-02-28", start: "2027-02-01" });
  });
});

describe("contas a pagar", () => {
  it("próximo vencimento mensal e anual, mantendo o dia original", () => {
    expect(nextDue("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDue("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextDue("2026-03-10", "yearly")).toBe("2027-03-10");
    expect(nextDue("2026-03-10", "once")).toBeNull();
  });
  it("lista vencimentos dentro da janela", () => {
    expect(occurrences("2026-10-10", "monthly", "2026-12-31")).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
  });
  it("sazonal: quanto guardar por mês", () => {
    expect(monthlySaving(240000, "2026-10-27", "2027-03-10")).toBe(48000);
    expect(monthlySaving(10000, "2026-10-27", "2026-10-30")).toBe(10000);
  });
});

describe("saldo previsto", () => {
  it("aplica entradas e saídas e acha o primeiro dia negativo", () => {
    const f = forecast(50000, "2026-10-27", 30, [
      { on: "2026-11-05", label: "Fatura", amountCents: -80000, kind: "card" },
      { on: "2026-11-07", label: "Salário", amountCents: 450000, kind: "income" },
      { on: "2026-12-30", label: "Fora", amountCents: -1, kind: "bill" },
    ]);
    expect(f.firstNegative).toBe("2026-11-05");
    expect(f.lowest).toEqual({ on: "2026-11-05", balanceCents: -30000 });
    expect(f.endCents).toBe(420000);
    expect(f.events).toHaveLength(2);
    expect(f.series).toHaveLength(30);
  });
});

describe("orçamento que acumula", () => {
  it("soma sobras e faltas dos meses anteriores", () => {
    expect(rolloverCarry(100000, [{ month: "2026-08", cents: 80000 }, { month: "2026-09", cents: 130000 }], "2026-08", "2026-10")).toBe(-10000);
    expect(rolloverCarry(100000, [], "2026-10", "2026-10")).toBe(0);
  });
});

describe("plano para quitar dívidas", () => {
  const debts = [
    { id: "a", name: "Cartão", balanceCents: 300000, monthlyRateBp: 1200, minPaymentCents: 30000 },
    { id: "b", name: "Empréstimo", balanceCents: 100000, monthlyRateBp: 200, minPaymentCents: 10000 },
  ];
  it("avalanche paga menos juros que snowball", () => {
    const av = payoffPlan(debts, 20000, "avalanche");
    const sb = payoffPlan(debts, 20000, "snowball");
    expect(av.feasible && sb.feasible).toBe(true);
    expect(av.interestCents).toBeLessThan(sb.interestCents);
    expect(av.order[0].id).toBe("a");
    expect(sb.order[0].id).toBe("b");
  });
  it("pagamento que não cobre os juros não tem fim", () => {
    expect(payoffPlan([{ id: "x", name: "X", balanceCents: 1000000, monthlyRateBp: 1000, minPaymentCents: 5000 }], 0, "avalanche").feasible).toBe(false);
  });
});

describe("desafios", () => {
  const tx = (occurredOn: string, description: string) => ({ occurredOn, description, amountCents: 3000, direction: "expense", status: "confirmed" });
  it("semana sem delivery perde com iFood", () => {
    expect(challengeProgress("no_delivery", "2026-10-20", "2026-10-26", "2026-10-23", [tx("2026-10-22", "IFOOD *Restaurante")]).status).toBe("lost");
    expect(challengeProgress("no_delivery", "2026-10-20", "2026-10-26", "2026-10-27", [tx("2026-10-22", "Mercado")]).status).toBe("won");
  });
  it("3 dias sem gastar", () => {
    const r = challengeProgress("no_spend_day", "2026-10-20", "2026-11-02", "2026-10-25", [tx("2026-10-20", "a"), tx("2026-10-21", "b")]);
    expect(r.status).toBe("won");
  });
  it("gastar menos que o mês passado", () => {
    expect(challengeProgress("spend_less", "2026-10-01", "2026-10-31", "2026-10-15", [tx("2026-10-02", "a")], { previousMonthCents: 2000 }).status).toBe("lost");
  });
});
