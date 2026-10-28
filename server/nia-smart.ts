// Nia 2: perguntas com período e estabelecimento, "posso gastar?", dicas de economia
// e pedidos que viram proposta. Cada resposta busca só os números de que precisa (mais rápido)
// e todos filtram pela própria pessoa.
import { categoryName } from "../shared/categories.js";
import { formatMoney } from "../shared/money.js";
import {
  affordAmount,
  categoryIn,
  isFollowUp,
  isHelp,
  isSavingTips,
  isSpendQuestion,
  merchantIn,
  normalize,
  parseIou,
  parsePayable,
  parsePeriod,
  parseReceivable,
  parseShopping,
  type NiaAction,
  type Period,
} from "../shared/nia-intents.js";
import { addMonths, dayLabel, daysInMonth } from "../shared/time.js";
import { loadAlerts } from "./alerts.js";
import type { SessionUser } from "./auth.js";
import { listBudgets } from "./budgets.js";
import { num, one, query } from "./db.js";
import { loadForecast } from "./planning.js";
import { reserveStatus } from "./protection.js";
import { bankCosts } from "./receivables.js";

export type SpendIntent = { kind: "spend"; period: Period | null; categoryId: string | null; merchant: string | null };
export type SmartReply = { reply: string; action?: NiaAction; suggestions?: string[]; intent?: SpendIntent };

const money = formatMoney;

// Apps de entrega (para "quanto gastei com delivery?" e as dicas)
const DELIVERY = "(ifood|rappi|ze delivery|aiqfome|uber eats|james delivery)";

/** "supermercado pao & cia" → "Supermercado Pao & Cia" */
const titleCase = (text: string) => text.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function monthPeriod(today: string): Period {
  const month = today.slice(0, 7);
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01`, label: "neste mês" };
}

// ---------------------------------------------------------------------------
// Pedidos (viram proposta: a pessoa confirma no cartão)

function describeAction(a: NiaAction) {
  switch (a.kind) {
    case "shopping":
      return `Ponho ${list(a.items)} na lista de compras da casa?`;
    case "payable":
      return `Crio o lembrete “${a.name}” de ${money(a.amountCents)} para ${dayLabel(a.dueOn)}${a.recurrence === "monthly" ? ", todo mês" : ""}? Aviso 3 dias antes.`;
    case "iou":
      return a.owedToMe
        ? `Anoto que ${a.otherName} te deve ${money(a.amountCents)} (${a.description})? ${a.otherName.split(" ")[0]} também vai ver.`
        : `Anoto que você deve ${money(a.amountCents)} a ${a.otherName} (${a.description})?`;
    case "receivable":
      return `Anoto ${money(a.amountCents)} em “Valores a receber” (${a.name})? Te aviso se demorar.`;
  }
}

export function actionReply(message: string, today: string, members: { id: string; name: string }[]): SmartReply | null {
  const shopping = parseShopping(message);
  const action: NiaAction | null = shopping
    ? { kind: "shopping", items: shopping }
    : (parsePayable(message, today) ?? parseIou(message, members) ?? parseReceivable(message));
  if (!action) return null;
  return { reply: describeAction(action), action };
}

// ---------------------------------------------------------------------------
// Quanto gastei (período, categoria, estabelecimento)

async function spending(user: SessionUser, intent: SpendIntent, today: string): Promise<SmartReply> {
  const period = intent.period ?? monthPeriod(today);
  const params: unknown[] = [user.id, period.start, period.end];
  let filter = "";
  if (intent.categoryId) {
    params.push(intent.categoryId);
    filter += ` AND a.category_id = $${params.length}`;
  }
  if (intent.merchant && /^(o |os )?delivery$/.test(intent.merchant)) {
    filter += ` AND (t.merchant ~* '${DELIVERY}' OR t.description ~* '${DELIVERY}')`;
  } else if (intent.merchant) {
    params.push(`%${intent.merchant}%`);
    filter += ` AND (t.merchant ILIKE $${params.length} OR t.description ILIKE $${params.length})`;
  }
  const rows = await query<{ cents: string; n: number; top: string | null; top_cents: string | null }>(
    `WITH items AS (
       SELECT t.id, t.merchant, a.category_id, a.amount_cents
         FROM transactions t JOIN transaction_allocations a ON a.transaction_id = t.id
        WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored
          AND t.occurred_on >= $2::date AND t.occurred_on < $3::date${filter}
     ), top AS (
       SELECT ${intent.categoryId || intent.merchant ? "merchant" : "category_id"} AS k, sum(amount_cents) AS c
         FROM items GROUP BY 1 ORDER BY 2 DESC LIMIT 3
     )
     SELECT (SELECT coalesce(sum(amount_cents), 0) FROM items) AS cents,
            (SELECT count(DISTINCT id)::int FROM items) AS n,
            top.k AS top, top.c AS top_cents
       FROM (SELECT 1) x LEFT JOIN top ON true`,
    params,
  );
  const total = num(rows[0]?.cents);
  const n = rows[0]?.n ?? 0;
  const what = intent.merchant ? ` em “${intent.merchant}”` : intent.categoryId ? ` com ${categoryName(intent.categoryId)}` : "";
  if (total === 0) {
    return {
      reply: `Não encontrei gastos${what} ${period.label}.`,
      intent,
      suggestions: ["E no mês passado?", "Quanto gastei este mês?"],
    };
  }
  const tops = rows
    .filter((r) => r.top)
    .map((r) => `${intent.categoryId || intent.merchant ? titleCase(r.top!) : categoryName(r.top!)} (${money(num(r.top_cents))})`);
  let reply = `Você gastou ${money(total)}${what} ${period.label}, em ${n} lançamento${n > 1 ? "s" : ""}.`;
  if (tops.length > 1 || (!intent.categoryId && !intent.merchant && tops.length)) reply += ` Principalmente ${list(tops)}.`;
  // No mês corrente, projeta o fechamento e compara com a média dos 3 meses anteriores
  if (!intent.period || period.label === "neste mês") {
    const month = today.slice(0, 7);
    const avgParams: unknown[] = [user.id, `${addMonths(month, -3)}-01`, `${month}-01`, ...params.slice(3)];
    const avg = await one<{ cents: string }>(
      `SELECT coalesce(sum(a.amount_cents), 0) AS cents
         FROM transactions t JOIN transaction_allocations a ON a.transaction_id = t.id
        WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored
          AND t.occurred_on >= $2::date AND t.occurred_on < $3::date${filter}`,
      avgParams,
    );
    const average = Math.round(num(avg?.cents) / 3);
    if (average > 0) {
      const day = Number(today.slice(8, 10));
      const projected = Math.round((total / day) * daysInMonth(month));
      const diff = Math.round(((projected - average) / average) * 100);
      if (Math.abs(diff) >= 10)
        reply += ` Nesse ritmo, o mês fecha em cerca de ${money(projected)} — ${Math.abs(diff)}% ${diff > 0 ? "acima" : "abaixo"} da sua média (${money(average)}).`;
      else reply += ` Está dentro da sua média dos últimos meses (${money(average)}).`;
    }
  }
  const suggestions = intent.period?.label === "no mês passado" ? ["E neste mês?", "Como economizar?"] : ["E no mês passado?", "Como economizar?"];
  if (!intent.categoryId && !intent.merchant) suggestions.unshift("E com alimentação?");
  return { reply, intent, suggestions };
}

// ---------------------------------------------------------------------------
// Posso gastar X?

async function afford(user: SessionUser, amount: number, categoryId: string | null, today: string): Promise<SmartReply> {
  const [forecast, reserve, budgets] = await Promise.all([loadForecast(user, today, 30), reserveStatus(user, today), listBudgets(user, today.slice(0, 7))]);
  const lowestAfter = forecast.lowest.balanceCents - amount;
  const budget = categoryId ? [...budgets.personal, ...budgets.family].find((b) => b.categoryId === categoryId) : null;
  const parts: string[] = [];
  let verdict: "sim" | "apertado" | "nao";
  if (!forecast.knownBalance) {
    verdict = "apertado";
    parts.push("Não sei o saldo das suas contas: informe em “Contas e extratos” para eu responder com segurança.");
  } else if (lowestAfter < 0) {
    verdict = "nao";
    parts.push(
      `Agora não: com ${money(amount)} a mais, seu saldo ficaria negativo em ${dayLabel(forecast.lowest.on)} (${money(lowestAfter)}), por causa das contas e faturas que já estão previstas.`,
    );
  } else if (lowestAfter < Math.max(30000, amount * 0.2)) {
    verdict = "apertado";
    parts.push(`Cabe, mas fica apertado: no dia mais justo (${dayLabel(forecast.lowest.on)}) sobrariam só ${money(lowestAfter)}.`);
  } else {
    verdict = "sim";
    parts.push(`Cabe. Mesmo no dia mais apertado dos próximos 30 (${dayLabel(forecast.lowest.on)}) ainda sobrariam ${money(lowestAfter)}.`);
  }
  if (budget) {
    const left = budget.limitCents + budget.carryCents - budget.spentCents;
    parts.push(
      left >= amount
        ? `No orçamento de ${categoryName(budget.categoryId)} ainda há ${money(left)}.`
        : `Mas passa do orçamento de ${categoryName(budget.categoryId)} (restam ${money(Math.max(0, left))}).`,
    );
  }
  if (verdict !== "sim" && reserve.reserveCents > 0) parts.push("Evite tirar da reserva de emergência para isso.");
  if (verdict !== "sim" && amount >= 50000) parts.push("Se for parcelar, veja antes o juro escondido em “Parcelar ou à vista?”.");
  return { reply: parts.join(" "), suggestions: ["Quanto vou ter no fim do mês?", "Como economizar?"] };
}

// ---------------------------------------------------------------------------
// Como economizar? (dicas com os números da própria pessoa)

async function savingTips(user: SessionUser, today: string): Promise<SmartReply> {
  const month = today.slice(0, 7);
  const [cats, alerts, banks, delivery] = await Promise.all([
    query<{ category_id: string; now: string; avg: string }>(
      `SELECT a.category_id,
              sum(a.amount_cents) FILTER (WHERE t.occurred_on >= $2::date) AS now,
              sum(a.amount_cents) FILTER (WHERE t.occurred_on < $2::date) / 3 AS avg
         FROM transactions t JOIN transaction_allocations a ON a.transaction_id = t.id
        WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored AND t.occurred_on >= $3::date
        GROUP BY 1`,
      [user.id, `${month}-01`, `${addMonths(month, -3)}-01`],
    ),
    loadAlerts(user),
    bankCosts(user, Number(today.slice(0, 4))),
    one<{ cents: string; n: number }>(
      `SELECT coalesce(sum(amount_cents), 0) AS cents, count(*)::int AS n FROM transactions
        WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND occurred_on >= $2::date - 30
          AND (merchant ~* '${DELIVERY}' OR description ~* '${DELIVERY}')`,
      [user.id, today],
    ),
  ]);
  const tips: string[] = [];
  const day = Number(today.slice(8, 10));
  const rising = cats
    .map((c) => ({ id: c.category_id, projected: Math.round((num(c.now) / day) * daysInMonth(month)), avg: num(c.avg) }))
    .filter((c) => c.avg > 5000 && c.projected > c.avg * 1.2 && c.id !== "outros")
    .sort((a, b) => b.projected - b.avg - (a.projected - a.avg))[0];
  if (rising)
    tips.push(`${categoryName(rising.id)} está subindo: nesse ritmo fecha o mês em ${money(rising.projected)}, contra ${money(rising.avg)} de média. Um limite no Orçamento ajuda a segurar.`);
  if (num(delivery?.cents) > 10000)
    tips.push(`Delivery: ${money(num(delivery!.cents))} em ${delivery!.n} pedidos nos últimos 30 dias. Trocar metade por comida de casa economizaria cerca de ${money(Math.round(num(delivery!.cents) / 2))} por mês — o desafio “mês sem delivery” ajuda.`);
  if (alerts.monthlyRecurringCents > 0 && alerts.recurring.length)
    tips.push(`Assinaturas e cobranças fixas somam ${money(alerts.monthlyRecurringCents)} por mês. Revise as que quase não usa (${list(alerts.recurring.filter((r) => r.kind === "assinatura").slice(0, 3).map((r) => r.label)) || "veja em Assinaturas"}).`);
  if (banks.totalCents > 0) tips.push(`Os bancos já te custaram ${money(banks.totalCents)} neste ano em tarifas e juros. Dá para pedir os serviços essenciais gratuitos ou trocar de conta.`);
  if (!tips.length) tips.push("Seus gastos estão estáveis. Para sobrar mais, defina um valor fixo para guardar todo mês logo que o salário cair — de preferência no dia do pagamento.");
  return { reply: tips.slice(0, 3).join("\n\n"), suggestions: ["Quanto gastei com delivery?", "Quais assinaturas tenho?", "Posso gastar 200?"] };
}

// ---------------------------------------------------------------------------
// Entrada

export async function smartReply(
  user: SessionUser,
  message: string,
  today: string,
  last: SpendIntent | null,
  help: string,
): Promise<SmartReply | null> {
  if (isHelp(message)) return { reply: help, suggestions: ["Quanto gastei este mês?", "Posso gastar 200?", "Põe leite na lista"] };
  const amount = affordAmount(message);
  if (amount) return afford(user, amount, categoryIn(message), today);
  if (isSavingTips(message)) return savingTips(user, today);
  const period = parsePeriod(message, today);
  const merchant = merchantIn(message);
  // "no iFood": a loja já diz tudo; a categoria vem do resto da frase, se houver
  const categoryId = categoryIn(merchant ? normalize(message).replace(merchant, "") : message);
  // "e no mês passado?" / "e com transporte?": completa com a pergunta anterior
  if (isFollowUp(message)) {
    return spending(
      user,
      {
        kind: "spend",
        period: period ?? last?.period ?? null,
        categoryId: categoryId ?? (merchant ? null : (last?.categoryId ?? null)),
        merchant: merchant ?? (categoryId ? null : (last?.merchant ?? null)),
      },
      today,
    );
  }
  if (isSpendQuestion(message) && (period || merchant || categoryId)) return spending(user, { kind: "spend", period, categoryId, merchant }, today);
  return null;
}
