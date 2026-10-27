import { describe, expect, it } from "vitest";
import { digestText } from "../server/push";

describe("texto do resumo diário", () => {
  it("junta tudo sem lojas nem valores", () => {
    const t = digestText({ pending: 2, bills: 1, reminders: 1, security: 1 });
    expect(t.body).toBe("Você tem 1 alerta de segurança, 2 compras para revisar, 1 conta vencendo e 1 lembrete (garantia, reembolso ou pontos).");
    expect(t.url).toBe("/#/seguranca");
    expect(t.body).not.toMatch(/R\$/);
  });
  it("só lembretes abre o início", () => {
    expect(digestText({ pending: 0, bills: 0, reminders: 3 })).toEqual({ body: "Você tem 3 lembretes (garantia, reembolso ou pontos).", url: "/#/inicio" });
  });
});
