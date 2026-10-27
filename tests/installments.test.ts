import { describe, expect, it } from "vitest";
import { compareInstallments, implicitMonthlyRate, monthlyToReach } from "../shared/installments";

describe("parcelar ou à vista", () => {
  it("sem juros: parcelar ganha se o dinheiro rende", () => {
    const v = compareInstallments(120000, 10000, 12, 0.008);
    expect(v.monthlyRate).toBe(0);
    expect(v.best).toBe("parcelado");
  });
  it("descobre o juro escondido", () => {
    // R$ 1.000 à vista ou 12x de R$ 100: cerca de 2,92% ao mês
    expect(implicitMonthlyRate(100000, 10000, 12)).toBeCloseTo(0.0292, 3);
    const v = compareInstallments(100000, 10000, 12, 0.008);
    expect(v.best).toBe("vista");
    expect(v.extraCents).toBe(20000);
  });
  it("desconto à vista pequeno vira empate ou parcelado", () => {
    const v = compareInstallments(117000, 10000, 12, 0.008);
    expect(["parcelado", "empate"]).toContain(v.best);
  });
});

describe("quanto guardar por mês", () => {
  it("sem rendimento divide igual", () => {
    expect(monthlyToReach(120000, 12, 0)).toBe(10000);
  });
  it("com rendimento guarda menos", () => {
    expect(monthlyToReach(120000, 12, 0.01)).toBeLessThan(10000);
    expect(monthlyToReach(100000, 10, 0, 100000)).toBe(0);
  });
});
