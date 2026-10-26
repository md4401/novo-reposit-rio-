// Nia: assistente financeira. Os números vêm do banco (finance.ts / alerts.ts);
// a IA, quando configurada, só redige a resposta. Sem IA, respostas por regras.
// Lançamentos ditos em linguagem natural viram PROPOSTA — nada é gravado sem confirmação.
import { CATEGORY_BY_ID, categoryName } from "../shared/categories.js";
import { formatMoney } from "../shared/money.js";
import { stripAccents } from "../shared/merchant.js";
import { parseExpenseStatement } from "../shared/parse-expense.js";
import { addMonths, monthLabel, monthOf, todayKey } from "../shared/time.js";
import type { NiaMessage, Proposal } from "../shared/types.js";
import { aiEnabled, niaAnswer } from "./ai.js";
import { loadAlerts } from "./alerts.js";
import type { SessionUser } from "./auth.js";
import { batch, num, q, query } from "./db.js";
import { familyNumbers, listGoals, personalNumbers } from "./finance.js";

export const WELCOME =
  "Oi! 👋 Sou a Nia, sua assistente financeira. Posso explicar seus gastos, revisar o que ficou pendente e " +
  "registrar compras quando você me conta (por texto ou voz). Seus dados detalhados são só seus.";

export async function listMessages(user: SessionUser): Promise<NiaMessage[]> {
  const rows = await query(
    `SELECT id, role, content, payload, created_at FROM ai_messages WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 60`,
    [user.id],
  );
  const messages = rows.reverse().map(mapMessage);
  if (messages.length === 0) {
    return [{ id: "welcome", role: "assistant", content: WELCOME, proposal: null, createdAt: new Date().toISOString() }];
  }
  return messages;
}

function mapMessage(r: Record<string, unknown>): NiaMessage {
  const payload = (r.payload as { proposal?: Proposal } | null) ?? null;
  return {
    id: r.id as string,
    role: r.role as NiaMessage["role"],
    content: r.content as string,
    proposal: payload?.proposal ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** Tudo o que a Nia pode citar: apenas números da própria pessoa e totais familiares agregados. */
async function buildContext(user: SessionUser) {
  const today = todayKey(user.timezone);
  const month = monthOf(today);
  const [mine, family, alerts, goals, extra] = await Promise.all([
    personalNumbers(user, month, 2),
    familyNumbers(user, month, 2),
    loadAlerts(user),
    listGoals(user),
    batch(
      [
        q(
          `SELECT description, amount_cents, occurred_on::text AS occurred_on FROM transactions
            WHERE profile_id = $1 AND status = 'pending' AND NOT ignored ORDER BY occurred_on DESC LIMIT 6`,
          [user.id],
        ),
        q(
          `SELECT description, amount_cents, occurred_on::text AS occurred_on FROM transactions
            WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND occurred_on >= $2
            ORDER BY amount_cents DESC LIMIT 3`,
          [user.id, `${month}-01`],
        ),
        q(
          `SELECT a.category_id, sum(a.amount_cents) AS cents
             FROM transaction_allocations a JOIN transactions t ON t.id = a.transaction_id
            WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored
              AND t.occurred_on >= $2 AND t.occurred_on < $3
            GROUP BY 1`,
          [user.id, `${addMonths(month, -1)}-01`, `${month}-01`],
        ),
      ],
      { readOnly: true },
    ),
  ]);
  const [pending, biggest, lastMonthCategories] = extra;
  return {
    hoje: today,
    mes: monthLabel(month),
    meus_totais_mes: mine.totals,
    minhas_categorias_mes: mine.categories.map((c) => ({ categoria: categoryName(c.categoryId), centavos: c.cents })),
    minhas_categorias_mes_passado: lastMonthCategories.map((c) => ({ categoria: categoryName(c.category_id as string), centavos: num(c.cents) })),
    meus_gastos_mes_passado: mine.series[0]?.expenseCents ?? 0,
    pendencias: pending.map((p) => ({ descricao: p.description, centavos: num(p.amount_cents), data: p.occurred_on })),
    maiores_gastos_mes: biggest.map((p) => ({ descricao: p.description, centavos: num(p.amount_cents), data: p.occurred_on })),
    assinaturas: alerts.recurring.map((r) => ({ nome: r.label, centavos: r.lastAmountCents, tipo: r.kind, proxima: r.nextExpectedOn })),
    custo_recorrente_mensal: alerts.monthlyRecurringCents,
    alertas: alerts.alerts.map((a) => `${a.title}: ${a.text}`),
    metas: goals.map((g) => ({ nome: g.name, tipo: g.scope === "family" ? "familiar" : "pessoal", guardado: g.savedCents, alvo: g.targetCents })),
    familia_totais_mes: family.totals,
    familia_categorias_mes: family.categories.map((c) => ({ categoria: categoryName(c.categoryId), centavos: c.cents })),
  };
}

type Context = Awaited<ReturnType<typeof buildContext>>;

const MONEY_KEY = /(cents|centavos|guardado|alvo|custo_recorrente_mensal|meus_gastos_mes_passado)$/i;

/** Para a IA: valores já formatados em reais (o modelo erra ao converter centavos). */
export function moneyForAi(value: unknown, key = ""): unknown {
  if (typeof value === "number" && MONEY_KEY.test(key)) return formatMoney(value);
  if (Array.isArray(value)) return value.map((v) => moneyForAi(v, key));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(/centavos$/, "valor").replace(/Cents$/, ""), moneyForAi(v, k)]));
  return value;
}

const money = formatMoney;

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Respostas sem IA: intenções comuns respondidas com os números do banco. */
export function ruleReply(question: string, ctx: Context): string {
  const text = stripAccents(question.toLowerCase());
  const has = (re: RegExp) => re.test(text);

  if (has(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey)\b/) && text.length < 25) {
    return `Olá! 😊 Em ${ctx.mes} você gastou ${money(ctx.meus_totais_mes.expenseCents)} até agora e tem ${ctx.pendencias.length} compra(s) para revisar. Quer que eu mostre por categoria?`;
  }
  if (has(/pendenc|pendente|classific|revis|falta|organizar/)) {
    if (ctx.pendencias.length === 0) return "Tudo organizado! ✅ Não há compras esperando classificação.";
    return (
      `Você tem ${ctx.pendencias.length} compra(s) esperando classificação: ` +
      list(ctx.pendencias.slice(0, 4).map((p) => `${p.descricao} (${money(p.centavos)})`)) +
      `. Toque em “Resumo diário” para revisar todas de uma vez — você pode dividir uma compra em várias categorias.`
    );
  }
  if (has(/assinatura|recorrent|mensalidade|streaming|netflix|spotify|cobranca fixa/)) {
    if (ctx.assinaturas.length === 0) return "Ainda não encontrei cobranças que se repetem. Elas aparecem depois de 2 ou 3 meses de extrato.";
    const aumento = ctx.alertas.find((a) => a.startsWith("Aumento"));
    return (
      `Encontrei ${ctx.assinaturas.length} cobrança(s) recorrente(s), cerca de ${money(ctx.custo_recorrente_mensal)} por mês: ` +
      list(ctx.assinaturas.slice(0, 5).map((a) => `${a.nome} (${money(a.centavos)})`)) +
      "." +
      (aumento ? ` Atenção: ${aumento}` : "")
    );
  }
  if (has(/alerta|duplic|suspeit|estranh|fraude|cobranca (a mais|errada)/)) {
    if (ctx.alertas.length === 0) return "Nenhum alerta no momento: sem duplicidades nem gastos muito fora do seu padrão.";
    return `Tenho ${ctx.alertas.length} ponto(s) para você conferir: ${ctx.alertas.slice(0, 3).join(" • ")}`;
  }
  if (has(/meta|objetivo|reserva|guardar|poupar|economizar|juntar/)) {
    if (ctx.metas.length === 0) return "Você ainda não tem metas. Que tal criar uma em “Metas e objetivos”?";
    return list(
      ctx.metas.map((m) => `${m.nome} (${m.tipo}): ${money(m.guardado)} de ${money(m.alvo)} — ${Math.round((m.guardado / m.alvo) * 100)}%`),
    ) + ".";
  }
  if (has(/familia|da casa|familiar|nossa casa/)) {
    const f = ctx.familia_totais_mes;
    const top = ctx.familia_categorias_mes.slice(0, 3).map((c) => `${c.categoria} (${money(c.centavos)})`);
    return (
      `Na família, em ${ctx.mes}: receitas compartilhadas de ${money(f.incomeCents)} e gastos da casa de ${money(f.expenseCents)}` +
      (top.length ? `, principalmente ${list(top)}` : "") +
      ". Esses números somam só o que cada pessoa marcou como familiar — sem mostrar quem comprou nem onde."
    );
  }
  if (has(/maior|mais caro|mais gastei/)) {
    if (ctx.maiores_gastos_mes.length === 0) return "Ainda não há gastos neste mês.";
    return `Seus maiores gastos em ${ctx.mes}: ${list(ctx.maiores_gastos_mes.map((g) => `${g.descricao} (${money(g.centavos)})`))}.`;
  }
  if (has(/receita|salario|saldo|sobrou|sobra|entrou|ganhei/)) {
    const t = ctx.meus_totais_mes;
    return `Em ${ctx.mes}: entradas de ${money(t.incomeCents)}, saídas de ${money(t.expenseCents)}, saldo de ${money(t.balanceCents)}.`;
  }
  // "quanto gastei com mercado/transporte?"
  const category = [...CATEGORY_BY_ID.values()].find(
    (c) => c.kind === "expense" && text.includes(stripAccents(c.name.toLowerCase())),
  );
  if (category && has(/quanto|gast|despes|total/)) {
    const now = ctx.minhas_categorias_mes.find((c) => c.categoria === category.name)?.centavos ?? 0;
    const before = ctx.minhas_categorias_mes_passado.find((c) => c.categoria === category.name)?.centavos ?? 0;
    const trend = before ? ` No mês passado foram ${money(before)}.` : "";
    return `Em ${ctx.mes} você gastou ${money(now)} com ${category.name}.${trend}`;
  }
  if (has(/gast|despes|quanto|compr|extrato|saiu|resumo/)) {
    const t = ctx.meus_totais_mes;
    const top = ctx.minhas_categorias_mes
      .filter((c) => c.categoria !== "A confirmar")
      .slice(0, 3)
      .map((c) => `${c.categoria} (${money(c.centavos)})`);
    const prev = ctx.meus_gastos_mes_passado;
    const diff = prev ? Math.round(((t.expenseCents - prev) / prev) * 100) : null;
    return (
      `Em ${ctx.mes} você gastou ${money(t.expenseCents)}` +
      (top.length ? `, principalmente com ${list(top)}` : "") +
      "." +
      (diff !== null ? ` Isso é ${Math.abs(diff)}% ${diff >= 0 ? "acima" : "abaixo"} do mês passado inteiro.` : "")
    );
  }
  return (
    "Posso ajudar com: seus gastos do mês, gastos por categoria, pendências, assinaturas, alertas, metas e o resumo da família. " +
    "Para registrar uma compra, é só dizer, por exemplo: “comprei R$ 80 de comida e R$ 30 de limpeza no mercado”."
  );
}

function describeProposal(p: Proposal) {
  const parts = p.allocations.map((a) => `${categoryName(a.categoryId)} ${money(a.amountCents)}`);
  const scope = p.allocations.every((a) => a.scope === "family") ? "familiar" : p.allocations.some((a) => a.scope === "family") ? "parte familiar" : "pessoal";
  return (
    `Entendi! ${p.direction === "income" ? "Receita" : "Compra"} de ${money(p.amountCents)} em “${p.description}”` +
    (parts.length > 1 ? `, dividida em ${list(parts)}` : ` (${parts[0]})`) +
    ` — ${scope}. Confira e toque em Confirmar para salvar, ou Editar para ajustar.`
  );
}

export async function askNia(user: SessionUser, message: string): Promise<NiaMessage[]> {
  const today = todayKey(user.timezone);
  const history = (
    await query<{ role: "user" | "assistant"; content: string }>(
      `SELECT role, content FROM ai_messages WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 6`,
      [user.id],
    )
  ).reverse();

  const proposal = parseExpenseStatement(message, today);
  let reply: string;
  if (proposal) {
    reply = describeProposal(proposal);
  } else {
    const ctx = await buildContext(user);
    reply = ruleReply(message, ctx);
    if (aiEnabled()) {
      try {
        const answer = await niaAnswer(message, moneyForAi(ctx), history);
        if (answer) reply = answer;
      } catch (error) {
        console.error("IA indisponível, usando regras", error);
      }
    }
  }

  const rows = await query(
    `INSERT INTO ai_messages (profile_id, role, content, payload, created_at)
     VALUES ($1, 'user', $2, NULL, now()), ($1, 'assistant', $3, $4, now() + interval '1 millisecond')
     RETURNING id, role, content, payload, created_at`,
    [user.id, message, reply, proposal ? JSON.stringify({ proposal }) : null],
  );
  return rows.map(mapMessage);
}
