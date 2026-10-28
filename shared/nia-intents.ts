// Entende pedidos e perguntas da Nia sem IA: período ("semana passada", "em setembro"),
// estabelecimento ("no iFood"), "posso gastar 300?", dicas e pedidos que viram PROPOSTA
// (lista de compras, lembrete de conta, acerto, valor a receber). Nada é gravado sem confirmação.
import { CATEGORY_BY_ID } from "./categories.js";
import { stripAccents } from "./merchant.js";
import { findAmounts, SPOKEN } from "./parse-expense.js";
import { addDays, addMonths, daysInMonth } from "./time.js";

export type Period = { start: string; end: string; label: string };

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function normalize(text: string) {
  return stripAccents(text.toLowerCase()).replace(/\s+/g, " ").trim();
}

/** Período citado na frase. `end` é exclusivo. Sem período, null. */
export function parsePeriod(input: string, today: string): Period | null {
  const text = normalize(input);
  const month = today.slice(0, 7);
  const monthStart = (m: string) => `${m}-01`;
  if (/\bhoje\b/.test(text)) return { start: today, end: addDays(today, 1), label: "hoje" };
  if (/\bontem\b/.test(text)) return { start: addDays(today, -1), end: today, label: "ontem" };
  // Semana começa na segunda
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  if (/semana passada|ultima semana/.test(text)) return { start: addDays(monday, -7), end: monday, label: "na semana passada" };
  if (/(esta|essa|nesta|nessa) semana/.test(text)) return { start: monday, end: addDays(today, 1), label: "nesta semana" };
  const lastDays = /ultimos (\d{1,3}) dias/.exec(text);
  if (lastDays) {
    const n = Math.min(365, Number(lastDays[1]));
    return { start: addDays(today, -(n - 1)), end: addDays(today, 1), label: `nos últimos ${n} dias` };
  }
  if (/mes passado|ultimo mes/.test(text)) {
    const m = addMonths(month, -1);
    return { start: monthStart(m), end: monthStart(month), label: "no mês passado" };
  }
  if (/(este|esse|neste|nesse) mes|\bdo mes\b|\bno mes\b/.test(text)) return { start: monthStart(month), end: monthStart(addMonths(month, 1)), label: "neste mês" };
  if (/(este|esse|neste|nesse) ano/.test(text))
    return { start: `${today.slice(0, 4)}-01-01`, end: addDays(today, 1), label: `em ${today.slice(0, 4)}` };
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(em|de|no mes de|durante)?\\s*${MONTHS[i]}\\b(?:\\s+(?:de\\s+)?(\\d{4}))?`);
    const m = re.exec(text);
    if (!m) continue;
    let year = m[2] ? Number(m[2]) : Number(today.slice(0, 4));
    // "em dezembro" falado em outubro: o dezembro que já passou
    if (!m[2] && i + 1 > Number(today.slice(5, 7))) year--;
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { start: monthStart(key), end: monthStart(addMonths(key, 1)), label: `em ${MONTHS[i] === "marco" ? "março" : MONTHS[i]}${m[2] ? ` de ${year}` : ""}` };
  }
  return null;
}

/** Categoria citada (nome ou palavra do dia a dia: mercado, farmácia, uber…). */
export function categoryIn(input: string): string | null {
  const text = normalize(input);
  for (const c of CATEGORY_BY_ID.values()) {
    if (c.kind === "expense" && new RegExp(`\\b${normalize(c.name)}\\b`).test(text)) return c.id;
  }
  for (const [re, id] of SPOKEN) if (re.test(text)) return id;
  return null;
}

export const isHelp = (input: string) =>
  /^(ajuda|help|menu|oi nia|o que (voce|vc) (sabe|faz|pode)|como (te |voce )?(uso|usar|funciona)|quais (sao )?(os )?comandos)/.test(normalize(input).replace(/[?!.]/g, ""));

const NOT_MERCHANT = /^(o |a |os |as )?(mes|semana|ano|dia|hoje|ontem|total|geral|cartao|credito|debito|pix|dinheiro|casa|familia)\b/;

/** Estabelecimento citado: "no iFood", "na Amazon", "com o Uber". */
export function merchantIn(input: string): string | null {
  const text = normalize(input).replace(/[?!.]/g, "");
  const m = /\b(?:no|na|nos|nas|com o|com a|com|em)\s+([a-z0-9][a-z0-9&' -]{1,30}?)(?=\s+(?:em|no|na|neste|nesta|nesse|nessa|este|esta|esse|essa|semana|mes|ano|hoje|ontem|desde|nos ultimos)\b|$)/.exec(text);
  if (!m) return null;
  const name = m[1].trim();
  if (NOT_MERCHANT.test(name) || MONTHS.some((mo) => name.startsWith(mo)) || /^\d/.test(name)) return null;
  if (categoryIn(name)) return null;
  return name.length >= 2 ? name : null;
}

export const isSpendQuestion = (input: string) => /\b(quanto|quantos|total|gast|despes|saiu|paguei|torrei)/.test(normalize(input));
export const isSavingTips = (input: string) => /economiz|cortar (gasto|despesa)|gastar menos|poupar|sobrar mais|dica|onde (posso )?cortar|reduzir (os )?gastos/.test(normalize(input));

/** "Posso gastar 300?", "dá para comprar uma TV de 2 mil?" */
export function affordAmount(input: string): number | null {
  const text = normalize(input);
  if (!/\b(posso|consigo|da (pra|para)|cabe|tenho como|vale a pena)\b/.test(text) || !/(gast|compr|pagar|cabe)/.test(text)) return null;
  const mil = /(\d+(?:[.,]\d+)?)\s*mil\b/.exec(text);
  if (mil) return Math.round(Number(mil[1].replace(",", ".")) * 100000);
  return findAmounts(text)[0]?.cents ?? null;
}

/** Pergunta de continuação: "e no mês passado?", "e com transporte?" */
export const isFollowUp = (input: string) => {
  const text = normalize(input);
  return text.length <= 45 && /^e\s+(n[oa]s?|em|com|o|a|de|d[oa]s?|na semana|ontem|hoje)\b/.test(text);
};

// ---------------------------------------------------------------------------
// Pedidos que viram proposta

export type NiaAction =
  | { kind: "shopping"; items: string[] }
  | { kind: "payable"; name: string; amountCents: number; dueOn: string; recurrence: "monthly" | "once"; categoryId: string }
  | { kind: "iou"; otherId: string; otherName: string; owedToMe: boolean; amountCents: number; description: string }
  | { kind: "receivable"; name: string; type: "saude" | "empresa" | "restituicao" | "emprestimo" | "outro"; amountCents: number; expectedOn: string | null };

export function parseShopping(input: string): string[] | null {
  const text = input.trim().replace(/[.!]+$/, "");
  const m = /^(?:p[oõ]e|coloca|coloque|adiciona|adicione|bota|bote|inclui|inclua|anota|anote|p[oô]r)\s+(.+?)\s+(?:na|à|a)\s+lista(?:\s+de\s+compras)?$/i.exec(text);
  if (!m) return null;
  const items = m[1]
    .split(/\s*,\s*|\s+e\s+/i)
    .map((s) => s.replace(/^(um|uma|uns|umas|o|a|os|as)\s+/i, "").trim())
    .filter((s) => s.length >= 2)
    .slice(0, 20);
  return items.length ? items.map((s) => s.slice(0, 60)) : null;
}

function nextDayOfMonth(today: string, day: number) {
  const month = today.slice(0, 7);
  const pick = (m: string) => `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, "0")}`;
  const candidate = pick(month);
  return candidate >= today ? candidate : pick(addMonths(month, 1));
}

/** "Me lembra de pagar a luz dia 10, 180 reais", "todo mês pagar internet 99 dia 5". */
export function parsePayable(input: string, today: string): Extract<NiaAction, { kind: "payable" }> | null {
  const text = normalize(input);
  const m = /\b(?:lembr\w*|avis\w*|anot\w*)\b.*?\bpagar\s+(?:a |o |as |os )?(.+?)(?=\s+(?:dia|todo|toda|no dia|de r\$|r\$|\d)|[,.]|$)/.exec(text);
  if (!m) return null;
  const name = m[1].trim();
  const day = /\bdia\s+(\d{1,2})\b/.exec(text);
  const amount = findAmounts(text.replace(/\bdia\s+\d{1,2}\b/, ""))[0]?.cents ?? null;
  if (!amount || !name) return null;
  const dueOn = day ? nextDayOfMonth(today, Math.max(1, Math.min(31, Number(day[1])))) : addDays(today, 7);
  const recurrence = /\b(todo|toda|mensal|todo mes|todos os meses)\b/.test(text) || /\b(luz|agua|internet|aluguel|condominio|celular|plano|escola|academia)\b/.test(name) ? "monthly" : "once";
  const categoryId = categoryIn(name) ?? "moradia";
  const pretty = name.replace(/\b\w/, (c) => c.toUpperCase());
  return { kind: "payable", name: pretty.slice(0, 60), amountCents: amount, dueOn, recurrence, categoryId };
}

/** "O Beto me deve 50 do mercado" / "devo 30 pra Ana do Uber". */
export function parseIou(input: string, members: { id: string; name: string }[]): Extract<NiaAction, { kind: "iou" }> | null {
  const text = normalize(input);
  const owesMe = /^(?:o |a )?([a-z]+)(?: [a-z]+)? me deve\b(.*)$/.exec(text);
  const iOwe = /^(?:eu )?devo\b(.*?)\b(?:pr[oa]|para|ao|a)\s+(?:o |a )?([a-z]+)\b(.*)$/.exec(text);
  const who = owesMe?.[1] ?? iOwe?.[2];
  if (!who) return null;
  const member = members.find((p) => normalize(p.name).split(" ")[0] === who);
  if (!member) return null;
  const rest = owesMe ? owesMe[2] : `${iOwe![1]} ${iOwe![3]}`;
  const amount = findAmounts(rest)[0]?.cents;
  if (!amount) return null;
  const what = /\b(?:d[eoa]s?|pel[oa]|com)\s+(?!r\$|\d)([a-z][a-z ]{1,40})$/.exec(rest.trim());
  return { kind: "iou", otherId: member.id, otherName: member.name, owedToMe: Boolean(owesMe), amountCents: amount, description: (what?.[1] ?? "acerto").trim().slice(0, 80) };
}

/** "Vou receber 300 de reembolso do plano", "emprestei 200 pro meu irmão". */
export function parseReceivable(input: string): Extract<NiaAction, { kind: "receivable" }> | null {
  const text = normalize(input);
  if (!/\b(vou receber|tenho a receber|a receber|emprestei|estao me devendo|vao me devolver)\b/.test(text)) return null;
  const amount = findAmounts(text)[0]?.cents;
  if (!amount) return null;
  const type = /restitui/.test(text) ? "restituicao" : /plano|consulta|medic|saude/.test(text) ? "saude" : /empresa|trabalho|viagem/.test(text) ? "empresa" : /emprestei|emprestimo/.test(text) ? "emprestimo" : "outro";
  const names = { saude: "Reembolso do plano de saúde", empresa: "Reembolso da empresa", restituicao: "Restituição do IR", emprestimo: "Dinheiro emprestado", outro: "Valor a receber" };
  return { kind: "receivable", name: names[type], type, amountCents: amount, expectedOn: null };
}
