import { describe, expect, it } from "vitest";
import { classifyWith, type Classifier } from "../server/classify";

const ctx = (defaultScope: "personal" | "family"): Classifier => ({ rules: new Map(), history: new Map(), defaultScope });

describe("classificação usa a visibilidade escolhida pela pessoa", () => {
  it("despesa por palavra-chave entra como Família quando é o padrão dela", () => {
    const c = classifyWith(ctx("family"), { description: "SUPERMERCADO BOM PRECO", merchant: "supermercado bom preco", direction: "expense" });
    expect(c.allocation?.scope).toBe("family");
    const p = classifyWith(ctx("personal"), { description: "SUPERMERCADO BOM PRECO", merchant: "supermercado bom preco", direction: "expense" });
    expect(p.allocation?.scope).toBe("personal");
  });

  it("transferência e regra aprendida mantêm a própria visibilidade", () => {
    expect(classifyWith(ctx("family"), { description: "PAGAMENTO DE FATURA", merchant: "pagamento de fatura", direction: "expense" }).allocation?.scope).toBe("personal");
    const withRule: Classifier = { ...ctx("family"), rules: new Map([["netflix", { id: "r1", categoryId: "assinaturas", scope: "personal" }]]) };
    expect(classifyWith(withRule, { description: "NETFLIX", merchant: "netflix", direction: "expense" }).allocation?.scope).toBe("personal");
  });
});
