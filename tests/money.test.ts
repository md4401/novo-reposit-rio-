import { describe, expect, it } from "vitest";
import { checkAllocations, formatMoney, parseMoney, splitProportionally } from "../shared/money";

describe("dinheiro em centavos", () => {
  it("lê valores em pt-BR", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(123456);
    expect(parseMoney("1234,56")).toBe(123456);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("80")).toBe(8000);
    expect(parseMoney("80 reais")).toBe(8000);
    expect(parseMoney("-45,90")).toBe(-4590);
    expect(parseMoney("1.234.567")).toBe(123456700);
    expect(parseMoney("0,1")).toBe(10);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });

  it("formata em reais", () => {
    expect(formatMoney(1548000)).toBe("R$ 15.480,00");
    expect(formatMoney(7950)).toBe("R$ 79,50");
  });

  it("divisão fecha centavo por centavo", () => {
    expect(checkAllocations(24000, [
      { categoryId: "alimentacao", amountCents: 15000, scope: "family" },
      { categoryId: "limpeza", amountCents: 6000, scope: "family" },
      { categoryId: "higiene", amountCents: 3000, scope: "family" },
    ]).ok).toBe(true);
    const wrong = checkAllocations(24000, [{ categoryId: "alimentacao", amountCents: 48000, scope: "family" }]);
    expect(wrong.ok).toBe(false);
    expect(wrong.diff).toBe(-24000);
    expect(checkAllocations(100, [{ categoryId: "outros", amountCents: 0, scope: "personal" }, { categoryId: "outros", amountCents: 100, scope: "personal" }]).ok).toBe(false);
    expect(checkAllocations(100, []).ok).toBe(false);
  });

  it("divide proporcionalmente sem perder centavos", () => {
    const parts = splitProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
});
