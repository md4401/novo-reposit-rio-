import { describe, expect, it } from "vitest";
import { buildUpcoming, splitInsights } from "../server/home";
import { INSIGHT_PRIORITY as P } from "../server/insights";
import type { CardInvoice, HouseBill, Insight, Payable, Recurring } from "../shared/types";

const today = "2026-10-27";

const payable = (name: string, dueOn: string, amountCents = 10000): Payable => ({
  id: name,
  name,
  categoryId: "moradia",
  amountCents,
  dueOn,
  recurrence: "monthly",
  remindDays: 3,
  accountId: null,
  seasonal: false,
  daysLeft: 0,
  monthlySavingCents: null,
  status: "ok",
});

const invoice = (dueOn: string, status: CardInvoice["status"], totalCents = 50000): CardInvoice => ({
  accountId: "card",
  accountName: "Nubank",
  closingOn: "2026-10-21",
  dueOn,
  totalCents,
  status,
  installmentsCents: 0,
});

const recurring = (label: string, nextExpectedOn: string, kind: Recurring["kind"] = "assinatura"): Recurring => ({
  merchant: label.toLowerCase(),
  label,
  categoryId: "assinaturas",
  kind,
  intervalDays: 30,
  lastOn: "2026-09-29",
  nextExpectedOn,
  lastAmountCents: 3990,
  previousAmountCents: null,
  count: 3,
  installment: null,
});

const bill = (name: string, dueOn: string, shares: HouseBill["shares"]): HouseBill => ({
  id: name,
  name,
  categoryId: "moradia",
  amountCents: shares.reduce((s, x) => s + x.amountCents, 0),
  dueOn,
  shares,
  canDelete: false,
});

describe("Início: próximos 7 dias", () => {
  it("junta contas, fatura, assinaturas e a minha parte da casa, por data", () => {
    const items = buildUpcoming({
      today,
      payables: [payable("Luz", "2026-10-29"), payable("Aluguel", "2026-11-10"), payable("Internet", "2026-10-25")],
      invoices: [invoice("2026-10-30", "closed"), invoice("2026-11-30", "open")],
      recurring: [recurring("Netflix", "2026-11-01"), recurring("Parcela TV", "2026-11-02", "parcela")],
      bills: [
        bill("Água", "2026-10-31", [
          { profileId: "eu", name: "Eu", amountCents: 4000, paid: false, isMe: true },
          { profileId: "mae", name: "Mãe", amountCents: 4000, paid: false, isMe: false },
        ]),
      ],
    });
    expect(items.map((i) => i.label)).toEqual(["Internet", "Luz", "Fatura Nubank", "Água (sua parte)", "Netflix"]);
    // Atrasada aparece marcada; aluguel (fora dos 7 dias), fatura futura e parcela ficam de fora
    expect(items[0]).toMatchObject({ overdue: true, kind: "bill" });
    // Da conta da casa, só a minha parte
    expect(items.find((i) => i.kind === "house")?.amountCents).toBe(4000);
  });

  it("não mostra a conta da casa que eu já paguei nem a parte de outra pessoa", () => {
    const items = buildUpcoming({
      today,
      payables: [],
      invoices: [],
      recurring: [],
      bills: [
        bill("Gás", "2026-10-28", [
          { profileId: "eu", name: "Eu", amountCents: 3000, paid: true, isMe: true },
          { profileId: "pai", name: "Pai", amountCents: 3000, paid: false, isMe: false },
        ]),
      ],
    });
    expect(items).toEqual([]);
  });

  it("limita a 6 itens", () => {
    const many = Array.from({ length: 9 }, (_, i) => payable(`Conta ${i}`, "2026-10-28"));
    expect(buildUpcoming({ today, payables: many, invoices: [], recurring: [], bills: [] })).toHaveLength(6);
  });
});

describe("Início: o que precisa de você × dicas", () => {
  const ins = (id: string): Insight => ({ id, icon: "", title: id, text: "" });

  it("alertas vão para as ações (até 4, mais urgentes primeiro) e dicas ficam separadas (até 2)", () => {
    const { actions, tips } = splitInsights([
      { item: ins("13º"), priority: P.info },
      { item: ins("fatura"), priority: P.dueSoon },
      { item: ins("orçamento"), priority: P.overBudget },
      { item: ins("pendências"), priority: P.pending },
      { item: ins("dados"), priority: P.stale },
      { item: ins("duplicada"), priority: P.duplicate },
      { item: ins("tendência"), priority: P.info },
      { item: ins("privacidade"), priority: P.filler },
    ]);
    expect(actions.map((a) => a.id)).toEqual(["orçamento", "duplicada", "pendências", "fatura"]);
    expect(tips.map((t) => t.id)).toEqual(["13º", "tendência"]);
  });

  it("sem dicas, mostra só a de privacidade; com uma dica, ela não divide espaço com a de privacidade", () => {
    expect(splitInsights([{ item: ins("privacidade"), priority: P.filler }]).tips.map((t) => t.id)).toEqual(["privacidade"]);
    expect(
      splitInsights([
        { item: ins("privacidade"), priority: P.filler },
        { item: ins("tendência"), priority: P.info },
      ]).tips.map((t) => t.id),
    ).toEqual(["tendência"]);
  });
});
