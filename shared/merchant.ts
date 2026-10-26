// Normaliza o texto do extrato para reconhecer o mesmo estabelecimento:
// "PAG*Padaria da Vila 22/10" e "padaria da vila" viram "padaria da vila".

const PREFIXES = [
  /^(compra|cp|cmp)\s+(com\s+)?(cartao|cart|debito|deb|credito|cred)\s*/,
  /^(pix|ted|doc)\s+(enviado|enviada|recebido|recebida|transf\w*)?\s*(para|de|-)?\s*/,
  /^(pagamento|pgto|pag)\s+(de\s+)?(boleto|conta)\s*/,
  /^(debito|deb)\s+(automatico|aut)\s*/,
  /^(pag|pg|mp|ifd|ec|pp|dl|sumup|stone|cielo|getnet|ebn|ebanx|paypal|pagseguro|picpay|mercadopago)\s*\*\s*/,
];

export function stripAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeMerchant(description: string) {
  let text = stripAccents(description.toLowerCase()).trim();
  for (const prefix of PREFIXES) text = text.replace(prefix, "");
  text = text
    .replace(/\.(com|net)(\.br)?\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ") // datas
    .replace(/\bparc(ela)?\s*\d+\s*(\/|de)\s*\d+\b/g, " ") // parcela 2/10
    .replace(/\b\d{2}:\d{2}\b/g, " ")
    .replace(/[*#_|\\/.,;:()[\]{}"'!?-]+/g, " ")
    .replace(/\b\d{4,}\b/g, " ") // códigos longos
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").filter(Boolean).slice(0, 4);
  return words.join(" ") || stripAccents(description.toLowerCase()).trim().slice(0, 40) || "sem descricao";
}

/** "parcela 2/10", "2/10", "02 de 10" → { n: 2, of: 10 } */
export function installmentOf(description: string) {
  const m = /(?:parc(?:ela)?\s*)?\b(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i.exec(description);
  if (!m) return null;
  const n = Number(m[1]);
  const of = Number(m[2]);
  if (n < 1 || of < 2 || n > of || of > 48) return null;
  // "22/10" (data) também casa: só conta como parcela se vier escrito "parc" ou o total for pequeno
  if (!/parc/i.test(description) && of > 24) return null;
  if (!/parc/i.test(description) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(description)) return null;
  return { n, of };
}

/** Pagamento de fatura, transferência entre contas próprias, aplicação/resgate: não é gasto. */
export function looksLikeTransfer(description: string) {
  const text = stripAccents(description.toLowerCase());
  return (
    /pagamento (de |da )?fatura|pgto fatura|pag fatura|fatura (do )?cart|pagamento recebido|pagto cartao/.test(text) ||
    /transf\w* entre contas|mesma titularidade|aplicacao|resgate|investimento|poupanca automatica/.test(text)
  );
}
