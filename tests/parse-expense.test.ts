import { describe, expect, it } from "vitest";
import { parseExpenseStatement } from "../shared/parse-expense";

const today = "2026-10-26";

describe("Nia entende lançamentos falados", () => {
  it("divide uma compra citada por voz", () => {
    const p = parseExpenseStatement("Comprei R$ 80 em comida e R$ 30 em limpeza no mercado", today)!;
    expect(p.amountCents).toBe(11000);
    expect(p.description).toBe("Mercado");
    expect(p.allocations).toEqual([
      { categoryId: "alimentacao", amountCents: 8000, scope: "personal" },
      { categoryId: "limpeza", amountCents: 3000, scope: "personal" },
    ]);
    expect(p.occurredOn).toBe(today);
  });

  it("entende o total seguido das partes e a família", () => {
    const p = parseExpenseStatement("ontem gastei 180 no mercado, 130 de comida e 50 de limpeza, coloca como familiar", today)!;
    expect(p.amountCents).toBe(18000);
    expect(p.occurredOn).toBe("2026-10-25");
    expect(p.allocations.map((a) => [a.categoryId, a.amountCents, a.scope])).toEqual([
      ["alimentacao", 13000, "family"],
      ["limpeza", 5000, "family"],
    ]);
  });

  it("usa o lugar para escolher a categoria", () => {
    const p = parseExpenseStatement("gastei 45,90 na farmácia", today)!;
    expect(p).toMatchObject({ amountCents: 4590, description: "Farmácia" });
    expect(p.allocations[0].categoryId).toBe("saude");
  });

  it("receitas e datas", () => {
    const p = parseExpenseStatement("recebi 300 reais de freela dia 20", today)!;
    expect(p).toMatchObject({ direction: "income", amountCents: 30000, occurredOn: "2026-10-20" });
    expect(p.allocations[0].categoryId).toBe("renda-extra");
  });

  it("entende as categorias novas", () => {
    expect(parseExpenseStatement("gastei 60 no restaurante", today)!.allocations[0].categoryId).toBe("restaurantes");
    expect(parseExpenseStatement("paguei 150 de roupa", today)!.allocations[0].categoryId).toBe("vestuario");
  });

  it("ignora perguntas", () => {
    expect(parseExpenseStatement("quanto gastei com mercado?", today)).toBeNull();
    expect(parseExpenseStatement("comprei pão", today)).toBeNull();
  });
});
