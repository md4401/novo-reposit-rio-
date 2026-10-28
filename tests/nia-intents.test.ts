import { describe, expect, it } from "vitest";
import { affordAmount, categoryIn, isFollowUp, isSavingTips, merchantIn, parseIou, parsePayable, parsePeriod, parseReceivable, parseShopping } from "../shared/nia-intents";

const today = "2026-10-27"; // terça

describe("Nia: período", () => {
  it("dias, semanas e meses", () => {
    expect(parsePeriod("quanto gastei hoje?", today)).toMatchObject({ start: "2026-10-27", end: "2026-10-28" });
    expect(parsePeriod("e ontem?", today)).toMatchObject({ start: "2026-10-26", end: "2026-10-27" });
    expect(parsePeriod("nesta semana", today)).toMatchObject({ start: "2026-10-26", end: "2026-10-28" });
    expect(parsePeriod("semana passada", today)).toMatchObject({ start: "2026-10-19", end: "2026-10-26" });
    expect(parsePeriod("no mês passado", today)).toMatchObject({ start: "2026-09-01", end: "2026-10-01" });
    expect(parsePeriod("em setembro", today)).toMatchObject({ start: "2026-09-01", end: "2026-10-01", label: "em setembro" });
    expect(parsePeriod("em dezembro", today)).toMatchObject({ start: "2025-12-01" });
    expect(parsePeriod("março de 2025", today)).toMatchObject({ start: "2025-03-01", label: "em março de 2025" });
    expect(parsePeriod("nos últimos 30 dias", today)).toMatchObject({ start: "2026-09-28", end: "2026-10-28" });
    expect(parsePeriod("quanto gastei?", today)).toBeNull();
  });
});

describe("Nia: categoria e estabelecimento", () => {
  it("categoria por nome ou palavra do dia a dia", () => {
    expect(categoryIn("quanto gastei com transporte")).toBe("transporte");
    expect(categoryIn("e no mercado?")).toBe("alimentacao");
    expect(categoryIn("na farmácia")).toBe("saude");
  });
  it("estabelecimento", () => {
    expect(merchantIn("quanto gastei no iFood este mês?")).toBe("ifood");
    expect(merchantIn("quanto paguei na Amazon em setembro")).toBe("amazon");
    expect(merchantIn("quanto gastei no mês passado")).toBeNull();
    expect(merchantIn("quanto gastei no mercado")).toBeNull();
  });
});

describe("Nia: perguntas", () => {
  it("posso gastar", () => {
    expect(affordAmount("posso gastar 300 reais?")).toBe(30000);
    expect(affordAmount("dá pra comprar uma TV de 2 mil?")).toBe(200000);
    expect(affordAmount("quanto gastei com 300?")).toBeNull();
  });
  it("dicas e continuação", () => {
    expect(isSavingTips("como economizar?")).toBe(true);
    expect(isSavingTips("onde posso cortar?")).toBe(true);
    expect(isFollowUp("e no mês passado?")).toBe(true);
    expect(isFollowUp("e com transporte?")).toBe(true);
    expect(isFollowUp("quanto gastei")).toBe(false);
  });
});

describe("Nia: pedidos que viram proposta", () => {
  it("lista de compras", () => {
    expect(parseShopping("Põe leite, pão e 2 kg de arroz na lista")).toEqual(["leite", "pão", "2 kg de arroz"]);
    expect(parseShopping("coloca um sabão em pó na lista de compras")).toEqual(["sabão em pó"]);
    expect(parseShopping("gastei 30 no mercado")).toBeNull();
  });
  it("lembrete de conta", () => {
    expect(parsePayable("me lembra de pagar a luz dia 10, 180 reais", today)).toEqual({
      kind: "payable", name: "Luz", amountCents: 18000, dueOn: "2026-11-10", recurrence: "monthly", categoryId: "moradia",
    });
    expect(parsePayable("me lembra de pagar o IPVA dia 30, R$ 1.200,00", today)).toMatchObject({ name: "Ipva", amountCents: 120000, dueOn: "2026-10-30", recurrence: "once" });
    expect(parsePayable("me lembra de pagar a luz", today)).toBeNull();
  });
  it("acertos", () => {
    const members = [{ id: "b", name: "Beto Silva" }, { id: "a", name: "Ana" }];
    expect(parseIou("O Beto me deve 50 do mercado", members)).toEqual({ kind: "iou", otherId: "b", otherName: "Beto Silva", owedToMe: true, amountCents: 5000, description: "mercado" });
    expect(parseIou("devo 30 pra Ana do uber", members)).toMatchObject({ otherId: "a", owedToMe: false, amountCents: 3000, description: "uber" });
    expect(parseIou("o Zé me deve 10", members)).toBeNull();
  });
  it("valores a receber", () => {
    expect(parseReceivable("vou receber 300 de reembolso do plano")).toMatchObject({ type: "saude", amountCents: 30000 });
    expect(parseReceivable("emprestei 200 pro meu irmão")).toMatchObject({ type: "emprestimo", amountCents: 20000 });
    expect(parseReceivable("recebi 300")).toBeNull();
  });
});

describe("Nia: ajuda", () => {
  it("reconhece pedidos de ajuda", async () => {
    const { isHelp } = await import("../shared/nia-intents");
    expect(isHelp("O que você sabe fazer?")).toBe(true);
    expect(isHelp("ajuda")).toBe(true);
    expect(isHelp("quanto gastei")).toBe(false);
  });
});
