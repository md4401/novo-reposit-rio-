import { describe, expect, it } from "vitest";
import { parseBankText } from "../shared/bank-text";

describe("notificações dos bancos", () => {
  it("Nubank: compra aprovada", () => {
    expect(parseBankText("Compra aprovada", "Compra de R$ 45,90 APROVADA em PADARIA REAL para o cartão com final 1234.")).toEqual({
      amountCents: 4590, direction: "expense", merchant: "PADARIA REAL", kind: "compra",
    });
  });
  it("Itaú: compra no cartão com valor depois", () => {
    const r = parseBankText("Itaú", "Compra aprovada no cartão final 9876: R$ 1.234,56 em MAGAZINE LUIZA dia 27/10.");
    expect(r).toMatchObject({ amountCents: 123456, direction: "expense", merchant: "MAGAZINE LUIZA" });
  });
  it("Pix enviado e recebido", () => {
    expect(parseBankText("Pix enviado", "Você enviou um Pix de R$ 50,00 para Maria Souza.")).toMatchObject({ amountCents: 5000, direction: "expense", kind: "pix", merchant: "Maria Souza" });
    expect(parseBankText("Pix recebido", "Você recebeu um Pix de R$ 120,00 de João Lima.")).toMatchObject({ amountCents: 12000, direction: "income", kind: "pix", merchant: "João Lima" });
  });
  it("Inter: texto curto", () => {
    expect(parseBankText("Compra aprovada", "R$ 23,90 em UBER TRIP")).toMatchObject({ amountCents: 2390, merchant: "UBER TRIP" });
  });
  it("ignora código de segurança, propaganda, estorno e fatura", () => {
    expect(parseBankText("Nubank", "Seu código de verificação é 123456")).toBeNull();
    expect(parseBankText("Oferta", "Ganhe R$ 10,00 de cashback de boas-vindas")).toBeNull();
    expect(parseBankText("Compra estornada", "A compra de R$ 30,00 em LOJA X foi estornada")).toBeNull();
    expect(parseBankText("Fatura", "Sua fatura fechou: R$ 980,00")).toBeNull();
    expect(parseBankText("Compra negada", "Compra de R$ 99,00 negada em LOJA")).toBeNull();
  });
  it("sem estabelecimento usa um nome genérico", () => {
    expect(parseBankText("Pix", "Pix enviado: R$ 15,00")).toMatchObject({ merchant: "Pix enviado" });
  });
});
