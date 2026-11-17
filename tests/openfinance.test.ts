import { describe, expect, it } from "vitest";
import { lastFour, pluggyRows } from "../server/openfinance";
import type { PluggyTransaction } from "../server/pluggy";

const tx = (over: Partial<PluggyTransaction>): PluggyTransaction => ({
  id: "t1",
  description: "Compra  no débito   PADARIA",
  amount: -12.5,
  date: "2026-11-10T03:00:00.000Z",
  type: "DEBIT",
  status: "POSTED",
  currencyCode: "BRL",
  ...over,
});

describe("Open Finance: transações da Pluggy viram linhas do ninho", () => {
  it("usa o tipo para o sentido, valor positivo em centavos e a data no fuso da pessoa", () => {
    const [row] = pluggyRows([tx({})], "America/Sao_Paulo", "2026-11-17");
    expect(row).toEqual({
      externalId: "pluggy:t1",
      occurredOn: "2026-11-10",
      description: "Compra no débito PADARIA",
      amountCents: 1250,
      direction: "expense",
    });
    // Cartão: compra vem com valor positivo e tipo DEBIT; estorno é CREDIT
    expect(pluggyRows([tx({ amount: 80, type: "DEBIT" })], "America/Sao_Paulo", "2026-11-17")[0].direction).toBe("expense");
    expect(pluggyRows([tx({ amount: 1500, type: "CREDIT" })], "America/Sao_Paulo", "2026-11-17")[0]).toMatchObject({ direction: "income", amountCents: 150000 });
  });

  it("um horário de madrugada em UTC cai no dia certo do Brasil", () => {
    expect(pluggyRows([tx({ date: "2026-11-11T01:30:00.000Z" })], "America/Sao_Paulo", "2026-11-17")[0].occurredOn).toBe("2026-11-10");
  });

  it("deixa de fora parcelas futuras pendentes, outras moedas e valor zero", () => {
    const rows = pluggyRows(
      [
        tx({ id: "futura", status: "PENDING", date: "2026-12-10T03:00:00.000Z" }),
        tx({ id: "hoje", status: "PENDING", date: "2026-11-17T15:00:00.000Z" }),
        tx({ id: "dolar", currencyCode: "USD" }),
        tx({ id: "zero", amount: 0 }),
      ],
      "America/Sao_Paulo",
      "2026-11-17",
    );
    expect(rows.map((r) => r.externalId)).toEqual(["pluggy:hoje"]);
  });
});

describe("Open Finance: final da conta", () => {
  it("usa só os dígitos e pega os 4 últimos", () => {
    expect(lastFour("0001/12345-6")).toBe("3456");
    expect(lastFour("4321")).toBe("4321");
    expect(lastFour("12")).toBeNull();
    expect(lastFour(null)).toBeNull();
  });
});
