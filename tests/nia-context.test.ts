import { describe, expect, it } from "vitest";
import { moneyForAi } from "../server/nia";

describe("contexto da Nia para a IA", () => {
  it("entrega valores em reais, não em centavos", () => {
    const out = moneyForAi({ meus_totais_mes: { expenseCents: 54380 }, maiores_gastos_mes: [{ descricao: "Mercado", centavos: 24590 }], hoje: "2026-10-26" });
    expect(out).toEqual({ meus_totais_mes: { expense: "R$ 543,80" }, maiores_gastos_mes: [{ descricao: "Mercado", valor: "R$ 245,90" }], hoje: "2026-10-26" });
  });
});
