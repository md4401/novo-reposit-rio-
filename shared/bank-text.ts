// Lê textos de notificação e comprovante dos bancos ("Compra de R$ 45,90 aprovada em PADARIA X").
// Usado na captura de notificações do APK e em textos compartilhados com o ninho. Testes: tests/bank-text.test.ts
import { parseMoney } from "./money.js";
import { stripAccents } from "./merchant.js";

/** Apps de banco cujas notificações o APK lê (as outras são ignoradas no próprio celular). */
export const BANK_PACKAGES: Record<string, string> = {
  "com.nu.production": "Nubank",
  "com.itau": "Itaú",
  "com.itau.iti": "iti",
  "br.com.intermedium": "Inter",
  "com.c6bank.app": "C6 Bank",
  "com.bradesco": "Bradesco",
  "br.com.bb.android": "Banco do Brasil",
  "br.com.gabba.Caixa": "Caixa",
  "com.santander.app": "Santander",
  "com.picpay": "PicPay",
  "com.mercadopago.wallet": "Mercado Pago",
  "br.com.original.bank": "Original",
  "com.neon": "Neon",
  "br.com.uol.ps.myaccount": "PagBank",
};

export type BankText = { amountCents: number; direction: "expense" | "income"; merchant: string; kind: "compra" | "pix" | "pagamento" | "saque" | "recebimento" };

const IGNORE = /(codigo|token|senha|verificac|limite disponivel|fatura (fechou|esta|disponivel|vence)|estornad|cancelad|negad|recusad|nao aprovad|tentativa|agendad|oferta|cashback de|ganhe|promoc|emprestimo pre-aprovado)/;

/** Devolve a movimentação descrita no texto, ou null se não for uma (ex.: código de segurança, propaganda). */
export function parseBankText(title: string, text: string): BankText | null {
  const raw = `${title ?? ""}. ${text ?? ""}`.replace(/\s+/g, " ").trim();
  const t = stripAccents(raw.toLowerCase());
  if (IGNORE.test(t)) return null;
  const amount = /r\$\s?(-?[\d.]+,\d{2})/i.exec(raw);
  if (!amount) return null;
  const amountCents = Math.abs(parseMoney(amount[1]) ?? 0);
  if (!amountCents) return null;

  const income = /(recebeu|recebido|recebimento|credito em conta|deposito|transferencia recebida|pix recebido|caiu na sua conta|entrou)/.test(t);
  const expense = /(compra|pagamento|pagou|enviou|enviado|transferencia enviada|pix enviado|debito|saque|voce gastou|aprovad)/.test(t);
  if (!income && !expense) return null;
  const direction = income && !/(compra|pagamento|enviou)/.test(t) ? "income" : "expense";
  const kind: BankText["kind"] = /pix/.test(t)
    ? "pix"
    : /saque/.test(t)
      ? "saque"
      : direction === "income"
        ? "recebimento"
        : /pagamento|boleto/.test(t)
          ? "pagamento"
          : "compra";

  // Estabelecimento ou pessoa: depois de "em", "para" ou "de", até o fim da frase
  const after = raw.slice(amount.index + amount[0].length);
  const m =
    /\b(?:em|no|na)\s+([^.,;:\n]+?)(?=\s+(?:para o|no cart|com o cart|cart[aã]o|final|em \d|dia|às|as \d)|[.,;\n]|$)/i.exec(after) ??
    /\b(?:para|pra)\s+([^.,;:\n]+?)(?=\s+(?:no|em|com|via)\b|[.,;\n]|$)/i.exec(after) ??
    /\bde\s+([^.,;:\n]+?)(?=\s+(?:no|em|com|via)\b|[.,;\n]|$)/i.exec(after) ??
    /\b(?:em|para|de)\s+([^.,;:\n]+?)(?=[.,;\n]|$)/i.exec(raw.slice(0, amount.index));
  let merchant = (m?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (/^(seu|sua|voce|você|conta|cartao|cartão)\b/i.test(merchant) || merchant.length < 2) merchant = "";
  if (!merchant) merchant = kind === "pix" ? (direction === "income" ? "Pix recebido" : "Pix enviado") : kind === "saque" ? "Saque" : "Compra no cartão";
  return { amountCents, direction, merchant: merchant.slice(0, 80), kind };
}
