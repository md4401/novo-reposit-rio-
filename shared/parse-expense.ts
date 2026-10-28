// Entende frases como "comprei R$ 80 de comida e R$ 30 de limpeza no mercado"
// (digitadas ou faladas) e monta uma PROPOSTA de lançamento. Nada é gravado sem a
// pessoa conferir e confirmar. Testado em tests/parse-expense.test.ts.
import { CATEGORY_BY_ID } from "./categories.js";
import { EXPENSE_KEYWORDS, INCOME_KEYWORDS } from "./keywords.js";
import { stripAccents } from "./merchant.js";
import { parseMoney } from "./money.js";
import { addDays, addMonths, monthOf } from "./time.js";
import type { Allocation, Proposal, Scope } from "./types.js";

const EXPENSE_VERBS = /\b(comprei|compramos|gastei|gastamos|paguei|pagamos|custou|anota|anote|registra|registre|lanca|lance|torrei)\b/;
const INCOME_VERBS = /\b(recebi|recebemos|ganhei|ganhamos|entrou|caiu)\b/;
const FAMILY_WORDS = /\b(familia|familiar|da casa|pra casa|para casa|de casa|compartilhad\w*|todo mundo)\b/;

// Palavras faladas que não estão no dicionário de estabelecimentos
const SPOKEN: [RegExp, string][] = [
  [/\b(restaurante|delivery|ifood|lanche|almoco fora|jantar fora|pizza|hamburguer)\b/, "restaurantes"],
  [/\b(comida|alimento\w*|alimentacao|almoco|janta|cafe da manha|mercado|feira|pao)\b/, "alimentacao"],
  [/\b(limpeza|produtos de limpeza)\b/, "limpeza"],
  [/\b(higiene|banho)\b/, "higiene"],
  [/\b(remedio\w*|saude|farmacia)\b/, "saude"],
  [/\b(gasolina|combustivel|transporte|uber|onibus)\b/, "transporte"],
  [/\b(luz|agua|aluguel|condominio|internet|gas|casa)\b/, "moradia"],
  [/\b(roupa\w*|sapato\w*|tenis)\b/, "vestuario"],
  [/\b(presente\w*|doacao)\b/, "presentes"],
  [/\b(compras)\b/, "compras"],
  [/\b(viagem|hotel|passagem)\b/, "viagens"],
  [/\b(cabelo|salao|manicure|barbeiro)\b/, "beleza"],
  [/\b(cinema|passeio|lazer|bar|cerveja)\b/, "lazer"],
];

/** Categoria citada primeiro no trecho ("em limpeza no mercado" → limpeza). */
function categoryFrom(segment: string, direction: "expense" | "income") {
  const patterns: [RegExp, string][] =
    direction === "income"
      ? INCOME_KEYWORDS
      : [
          ...SPOKEN,
          ...EXPENSE_KEYWORDS,
          ...[...CATEGORY_BY_ID.values()]
            .filter((c) => c.kind === "expense")
            .map((c): [RegExp, string] => [new RegExp(`\\b${stripAccents(c.name.toLowerCase())}\\b`), c.id]),
        ];
  let best: { id: string; index: number } | null = null;
  for (const [pattern, id] of patterns) {
    const m = pattern.exec(segment);
    if (m && (!best || m.index < best.index)) best = { id, index: m.index };
  }
  return best?.id ?? null;
}

const AMOUNT = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(reais|real|conto|contos|pila))?/g;

function findAmounts(text: string) {
  const found: { cents: number; index: number; end: number }[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const before = text.slice(Math.max(0, m.index - 5), m.index);
    const after = text.slice(m.index + m[0].length);
    const moneyMark = /r\$/.test(m[0]) || Boolean(m[2]);
    // "dia 22", "às 10", "2/10" e "10h" não são valores
    if (!moneyMark && (/\b(dia|as)\s*$/.test(before) || /^\s*h\b/.test(after))) continue;
    if (/\/\s*$/.test(before) || /^\s*\//.test(after)) continue;
    const cents = parseMoney(m[1]);
    if (cents && cents > 0) found.push({ cents, index: m.index, end: m.index + m[0].length });
  }
  return found;
}

function capitalize(text: string) {
  return text.replace(/(^|\s)(\p{L})/gu, (_, space: string, c: string) => space + c.toUpperCase());
}

function findPlace(original: string) {
  // "no mercado Boa Compra", "na Farmácia Vida", "lá na padaria"
  const pattern =
    /\b(?:no|na|nos|nas)\s+([\p{L}][\p{L}&'. ]{2,40}?)(?=\s*(?:,|\.|;|:|$|\be\b|\bpor\b|\bde\b|\bcom\b|\bpra\b|\bpara\b|\bhoje\b|\bontem\b|r\$|\d))/giu;
  for (const m of original.matchAll(pattern)) {
    const place = m[1].trim();
    if (/^(dinheiro|cart[aã]o|pix|d[eé]bito|cr[eé]dito|reais|casa|fam[ií]lia|conta)$/i.test(place)) continue;
    return capitalize(place);
  }
  return null;
}

function findDate(text: string, today: string) {
  if (/\banteontem\b/.test(text)) return addDays(today, -2);
  if (/\bontem\b/.test(text)) return addDays(today, -1);
  const m = /\bdia\s+(\d{1,2})\b/.exec(text);
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) {
      let month = monthOf(today);
      if (day > Number(today.slice(8, 10))) month = addMonths(month, -1);
      const key = `${month}-${String(day).padStart(2, "0")}`;
      const d = new Date(`${key}T00:00:00Z`);
      if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key) return key;
    }
  }
  return today;
}

export function parseExpenseStatement(input: string, today: string): Proposal | null {
  const original = input.trim();
  const text = stripAccents(original.toLowerCase());
  const income = INCOME_VERBS.test(text) && !EXPENSE_VERBS.test(text);
  if (!income && !EXPENSE_VERBS.test(text)) return null;
  const direction = income ? "income" : "expense";
  const amounts = findAmounts(text);
  if (amounts.length === 0) return null;
  const scope: Scope = FAMILY_WORDS.test(text) ? "family" : "personal";

  // Cada valor leva a categoria citada logo depois dele (ou logo antes, se não houver).
  const parts = amounts.map((a, i) => {
    const after = text.slice(a.end, amounts[i + 1]?.index ?? text.length);
    const before = text.slice(amounts[i - 1]?.end ?? 0, a.index);
    return { cents: a.cents, categoryId: categoryFrom(after, direction) ?? categoryFrom(before, direction) };
  });

  // "200 no mercado: 150 de comida e 50 de limpeza" → 200 é o total
  let items = parts;
  if (parts.length >= 3) {
    const [first, ...rest] = parts;
    if (rest.reduce((s, p) => s + p.cents, 0) === first.cents) items = rest;
  }

  const place = findPlace(original);
  const fallback = direction === "income" ? "outras-receitas" : "outros";
  const merged = new Map<string, number>();
  for (const p of items) {
    const id = p.categoryId ?? (direction === "expense" ? (place ? categoryFrom(stripAccents(place.toLowerCase()), direction) : null) : null) ?? fallback;
    merged.set(id, (merged.get(id) ?? 0) + p.cents);
  }
  const allocations: Allocation[] = [...merged].map(([categoryId, amountCents]) => ({ categoryId, amountCents, scope }));
  const amountCents = allocations.reduce((s, a) => s + a.amountCents, 0);
  const first = CATEGORY_BY_ID.get(allocations[0].categoryId)?.name ?? "Lançamento";
  const description = place ?? (allocations.length > 1 ? "Compra com várias categorias" : direction === "income" ? `Receita: ${first}` : first);

  return { description, amountCents, direction, occurredOn: findDate(text, today), allocations };
}
