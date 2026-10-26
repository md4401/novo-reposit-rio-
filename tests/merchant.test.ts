import { describe, expect, it } from "vitest";
import { installmentOf, looksLikeTransfer, normalizeMerchant } from "../shared/merchant";
import { guessCategory } from "../shared/keywords";

describe("estabelecimentos", () => {
  it("normaliza o texto do extrato", () => {
    expect(normalizeMerchant("PAG*Padaria da Vila 22/10")).toBe("padaria da vila");
    expect(normalizeMerchant("COMPRA CARTAO PADARIA DA VILA")).toBe("padaria da vila");
    expect(normalizeMerchant("Netflix.com")).toBe("netflix");
    expect(normalizeMerchant("Farmácia Vida")).toBe("farmacia vida");
  });

  it("reconhece parcelas e transferências", () => {
    expect(installmentOf("Loja Central - Parcela 2/10")).toEqual({ n: 2, of: 10 });
    expect(installmentOf("Padaria 22/10")).toBeNull();
    expect(looksLikeTransfer("Pagamento de fatura")).toBe(true);
    expect(looksLikeTransfer("Pagamento recebido")).toBe(true);
    expect(looksLikeTransfer("Mercado Boa Compra")).toBe(false);
  });

  it("sugere categorias por palavra-chave", () => {
    expect(guessCategory("Supermercado Pão & Cia")).toBe("alimentacao");
    expect(guessCategory("Posto Estrela")).toBe("transporte");
    expect(guessCategory("Drogaria São Paulo")).toBe("saude");
    expect(guessCategory("NETFLIX.COM")).toBe("assinaturas");
    expect(guessCategory("Barbearia do Zé")).toBeNull();
    expect(guessCategory("PIX RECEBIDO SALARIO", "income")).toBe("salario");
  });
});
