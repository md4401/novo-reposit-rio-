import { describe, expect, it } from "vitest";
import { detectAlerts, detectRecurring, type TxLite } from "../server/insights";

let id = 0;
const tx = (occurredOn: string, merchant: string, amountCents: number, categoryId: string | null = null, description = merchant): TxLite => ({
  id: `t${++id}`,
  occurredOn,
  merchant,
  description,
  amountCents,
  direction: "expense",
  categoryId,
});

describe("assinaturas e alertas", () => {
  const today = "2026-10-26";
  const list = [
    tx("2026-07-21", "netflix", 3990, "assinaturas"),
    tx("2026-08-21", "netflix", 3990, "assinaturas"),
    tx("2026-09-21", "netflix", 3990, "assinaturas"),
    tx("2026-10-21", "netflix", 3990, "assinaturas"),
    tx("2026-08-05", "academia", 11990, "lazer"),
    tx("2026-09-05", "academia", 11990, "lazer"),
    tx("2026-10-05", "academia", 12990, "lazer"),
    tx("2026-10-01", "padaria", 1500, "alimentacao"),
    tx("2026-10-04", "padaria", 1800, "alimentacao"),
    tx("2026-10-08", "padaria", 1200, "alimentacao"),
    tx("2026-10-20", "posto estrela", 16500, "transporte"),
    tx("2026-10-20", "posto estrela", 16500, "transporte"),
    tx("2026-10-10", "loja central", 18750, "compras", "Loja Central - Parcela 2/5"),
  ];

  it("detecta assinaturas mensais, não compras frequentes", () => {
    const { recurring, installments } = detectRecurring(list, today);
    expect(recurring.map((r) => r.merchant).sort()).toEqual(["academia", "netflix"]);
    expect(recurring.find((r) => r.merchant === "netflix")).toMatchObject({ kind: "assinatura", nextExpectedOn: "2026-11-21" });
    expect(installments[0]).toMatchObject({ merchant: "loja central", installment: { n: 2, of: 5 } });
  });

  it("avisa aumento e possível duplicidade, sem apagar nada", () => {
    const { recurring } = detectRecurring(list, today);
    const alerts = detectAlerts(list, recurring, today, new Set());
    expect(alerts.map((a) => a.type).sort()).toEqual(["duplicate", "increase"]);
    expect(alerts.find((a) => a.type === "increase")!.text).toContain("R$ 10,00");
    const dismissed = new Set(alerts.map((a) => a.key));
    expect(detectAlerts(list, recurring, today, dismissed)).toHaveLength(0);
  });

  it("gasto fora do padrão da categoria", () => {
    const history = [1, 2, 3, 4, 5, 6].map((i) => tx(`2026-0${i + 2}-1${i}`, `loja ${i}`, 12000 + i * 500, "compras"));
    const big = tx("2026-10-15", "loja eletronicos", 129900, "compras");
    const alerts = detectAlerts([...history, big], [], today, new Set());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "unusual", transactionIds: [big.id] });
  });
});
