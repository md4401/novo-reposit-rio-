import { describe, expect, it } from "vitest";
import { moneyForAi, ruleReply } from "../server/nia";

describe("contexto da Nia para a IA", () => {
  it("entrega valores em reais, não em centavos", () => {
    const out = moneyForAi({ meus_totais_mes: { expenseCents: 54380 }, maiores_gastos_mes: [{ descricao: "Mercado", centavos: 24590 }], hoje: "2026-10-26" });
    expect(out).toEqual({ meus_totais_mes: { expense: "R$ 543,80" }, maiores_gastos_mes: [{ descricao: "Mercado", valor: "R$ 245,90" }], hoje: "2026-10-26" });
  });
});

describe("Nia responde sobre planejamento sem IA", () => {
  const ctx = {
    mes: "outubro de 2026",
    pendencias: [],
    faturas: [{ cartao: "Nubank", vence: "2026-11-10", centavos: 123450, situacao: "fechada" }],
    contas_a_pagar: [{ nome: "Luz", vence: "2026-10-30", dias: 3, centavos: 18990, situacao: "vence logo" }],
    saldo_previsto_30_dias: { hoje_centavos: 100000, fim_centavos: 20000, menor_centavos: -5000, dia_do_menor: "2026-11-10", fica_negativo_em: "2026-11-10", saldo_informado: true },
    patrimonio: { bens_centavos: 500000, dividas_centavos: 120000, liquido_centavos: 380000 },
    desafios: [{ desafio: "Um mês sem delivery", progresso: "40%", detalhe: "12 de 30 dias", termina: "2026-11-20" }],
  } as never;

  it("fatura, contas, previsão, patrimônio e desafios", () => {
    expect(ruleReply("quanto está a fatura do cartão?", ctx)).toContain("R$ 1.234,50");
    expect(ruleReply("quais contas a pagar tenho?", ctx)).toContain("Luz R$ 189,90 (em 3 dia(s))");
    expect(ruleReply("vai sobrar dinheiro no fim do mês?", ctx)).toContain("Pode ficar negativo em 10 nov");
    expect(ruleReply("qual meu patrimônio?", ctx)).toContain("R$ 3.800,00");
    expect(ruleReply("como vai meu desafio?", ctx)).toContain("40%");
  });
});
