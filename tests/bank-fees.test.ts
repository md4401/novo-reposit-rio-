import { describe, expect, it } from "vitest";
import { feeKind } from "../shared/bank-fees";

describe("custo dos bancos", () => {
  it("reconhece tarifas, juros, IOF, anuidade e multas", () => {
    expect(feeKind("TARIFA PACOTE SERVICOS")).toBe("tarifa");
    expect(feeKind("Cesta de Serviços Itaú")).toBe("tarifa");
    expect(feeKind("IOF COMPRA INTERNACIONAL")).toBe("iof");
    expect(feeKind("Juros do cheque especial")).toBe("juros");
    expect(feeKind("ENCARGOS ROTATIVO")).toBe("juros");
    expect(feeKind("Anuidade Diferenciada 3/12")).toBe("anuidade");
    expect(feeKind("Multa por atraso")).toBe("multa");
  });
  it("não confunde compras comuns nem estornos", () => {
    expect(feeKind("Supermercado Bom Preço")).toBeNull();
    expect(feeKind("ESTORNO TARIFA")).toBeNull();
    expect(feeKind("Rendimento poupança")).toBeNull();
  });
});
