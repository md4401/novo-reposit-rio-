import { describe, expect, it } from "vitest";
import { cleanItems } from "../server/receipts";

describe("Notas fiscais: itens lidos", () => {
  it("guarda só itens válidos, com nome curto e categoria de gasto", () => {
    const items = cleanItems([
      { name: "  Arroz 5 kg ", amountCents: 2800, categoryId: "alimentacao" },
      { name: "Item com categoria estranha", amountCents: 100, categoryId: "salario" },
      { name: "Sem valor", amountCents: 0, categoryId: "limpeza" },
      { name: "", amountCents: 500, categoryId: "limpeza" },
      { name: "Quebrado", amountCents: 12.5, categoryId: "limpeza" },
      "lixo",
    ]);
    expect(items).toEqual([
      { name: "Arroz 5 kg", amountCents: 2800, categoryId: "alimentacao" },
      { name: "Item com categoria estranha", amountCents: 100, categoryId: "outros" },
    ]);
  });

  it("aceita lista vazia ou ausente", () => {
    expect(cleanItems(undefined)).toEqual([]);
    expect(cleanItems("x")).toEqual([]);
  });
});
