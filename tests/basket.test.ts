import { describe, expect, it } from "vitest";
import { basketEligible, priceChangeBp, productKey } from "../shared/basket";

describe("cesta da família", () => {
  it("junta o mesmo produto escrito de jeitos diferentes", () => {
    expect(productKey("ARROZ TIO JOAO 5KG")).toBe(productKey("Arroz Tio João 5 kg"));
    expect(productKey("LEITE INTEGRAL 1LT 7891234567890")).toBe("leite integral 1l");
    expect(productKey("Café  Pilão 500 GR")).toBe("cafe pilao 500g");
  });

  it("calcula a variação de preço", () => {
    expect(priceChangeBp([{ month: "2026-01", avgCents: 2000, count: 1 }])).toBeNull();
    expect(
      priceChangeBp([
        { month: "2026-01", avgCents: 2000, count: 1 },
        { month: "2026-03", avgCents: 2250, count: 2 },
      ]),
    ).toBe(1250);
  });

  it("só aceita compra inteira da família (privacidade)", () => {
    expect(basketEligible(["family"], false)).toBe(true);
    expect(basketEligible(["family", "family"], false)).toBe(true);
    // Compra dividida: a parte pessoal não pode aparecer para a família
    expect(basketEligible(["family", "personal"], false)).toBe(false);
    expect(basketEligible(["personal"], false)).toBe(false);
    // Sem categoria ainda, ou ignorada
    expect(basketEligible([], false)).toBe(false);
    expect(basketEligible(["family"], true)).toBe(false);
  });
});
