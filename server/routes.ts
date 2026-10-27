// Todas as rotas da API numa única função (o plano grátis da Vercel limita o número de funções).
// Regra de ouro: toda consulta pessoal filtra por profile_id da sessão; a família só vê agregados.
import { CATEGORY_BY_ID } from "../shared/categories.js";
import { formatMoney } from "../shared/money.js";
import { normalizeMerchant } from "../shared/merchant.js";
import { addMonths, daysBetween as daysBetweenKeys, isDateKey, monthLabel, monthOf, todayKey } from "../shared/time.js";
import type {
  Account,
  Allocation,
  BudgetsPayload,
  Family,
  Health,
  Insight,
  Me,
  Overview,
  Personal,
  ReceiptReading,
  Rule,
  SourceHealth,
} from "../shared/types.js";
import { aiEnabled, readReceiptWithAi, transcribe, transcriptionEnabled } from "./ai.js";
import { loadAlerts } from "./alerts.js";
import {
  audit,
  createSession,
  endSession,
  hashPassword,
  newInviteCode,
  rateLimit,
  requireUser,
  verifyPassword,
  type SessionUser,
} from "./auth.js";
import { classify, learnFromConfirmation } from "./classify.js";
import { batch, num, one, q, query } from "./db.js";
import { clearDemo, seedDemo } from "./demo.js";
import {
  accountBalances,
  allocationRows,
  assertAccount,
  familyNumbers,
  getTransaction,
  INSERT_ALLOCATIONS,
  insertTransaction,
  linkGoal,
  listGoals,
  listTransactions,
  parseAllocations,
  personalNumbers,
  validateAllocations,
} from "./finance.js";
import {
  bool,
  type Body,
  cents,
  clientIp,
  dateKey,
  HttpError,
  int,
  json,
  logError,
  monthParam,
  oneOf,
  preflight,
  readJson,
  str,
  uuid,
  withCors,
} from "./http.js";
import { createBill, deleteBill, duplicateBill, listBills, payShare, unpayShare } from "./bills.js";
import { listBudgets, summarize } from "./budgets.js";
import { deleteAccount, leaveHousehold, removeMember, setRole } from "./household.js";
import { askNia, listMessages } from "./nia.js";
import { changePassword, createResetCode, requestReset, resetWithCode } from "./password.js";
import { sendDueDigests, vapidKeys } from "./push.js";
import { deleteReceipt, receiptImage, saveReceipt } from "./receipts.js";
import { buildReport, createReportLink, redeemReportLink, reportPdf } from "./report.js";
import { cardInvoices, deletePayable, listPayables, loadForecast, payablesDue, payPayable, savePayable, type PayableInput } from "./planning.js";
import { importStatement } from "./statement-import.js";

type Ctx = { request: Request; url: URL; params: string[] };
type Handler = (ctx: Ctx) => Promise<Response>;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:id/g, "([^/]+)")}$`), handler]);

const AVATAR_COLORS = ["#1e6650", "#2f6f9f", "#b4514d", "#a36b20", "#6b4fa0", "#2b8a8a"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ===========================================================================
// Conta e família

route("GET", "ping", async () => {
  await query("SELECT 1");
  return json({ ok: true });
});

route("POST", "auth/register", async ({ request }) => {
  const body = await readJson(request);
  await rateLimit(`register:${clientIp(request)}`, 10, 60);
  const name = str(body, "name", { max: 60, label: "seu nome" })!;
  const email = str(body, "email", { max: 120, label: "e-mail" })!.toLowerCase();
  const password = str(body, "password", { max: 200, min: 8, label: "senha" })!;
  if (!EMAIL.test(email)) throw new HttpError(400, "E-mail inválido");
  const mode = oneOf(body.mode ?? "create", ["create", "join"] as const, "modo");
  const wantsDemo = body.demo === true;

  if (await one(`SELECT 1 FROM profiles WHERE lower(email) = $1`, [email]))
    throw new HttpError(409, "Já existe uma conta com esse e-mail. Use “Entrar”.");

  let householdId: string;
  let role: "admin" | "member" = "member";
  if (mode === "join") {
    const code = str(body, "inviteCode", { max: 12, label: "código da família" })!.toUpperCase().replace(/\s/g, "");
    const household = await one<{ id: string; members: number }>(
      `SELECT h.id, (SELECT count(*)::int FROM profiles p WHERE p.household_id = h.id AND NOT p.is_demo) AS members
         FROM households h WHERE h.invite_code = $1`,
      [code],
    );
    if (!household) throw new HttpError(404, "Código da família não encontrado. Confira com quem te convidou.");
    if (household.members >= 6) throw new HttpError(400, "Essa família já tem 6 integrantes.");
    householdId = household.id;
  } else {
    role = "admin";
    const householdName = str(body, "householdName", { max: 60, optional: true, label: "nome da família" }) ?? `Família de ${name.split(" ")[0]}`;
    let created: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      created = await one<{ id: string }>(
        `INSERT INTO households (name, invite_code) VALUES ($1, $2) ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
        [householdName, newInviteCode()],
      );
    }
    if (!created) throw new HttpError(500, "Não foi possível criar a família. Tente de novo.");
    householdId = created.id;
  }

  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM profiles WHERE household_id = $1`, [householdId]);
  let profile: { id: string } | null;
  try {
    profile = await one<{ id: string }>(
      `INSERT INTO profiles (household_id, name, email, password_hash, role, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [householdId, name, email, await hashPassword(password), role, AVATAR_COLORS[(count?.n ?? 0) % AVATAR_COLORS.length]],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "Já existe uma conta com esse e-mail.");
    throw error;
  }
  const token = await createSession(profile!.id, request.headers.get("user-agent"));
  await audit(profile!.id, "profile.created", "household", householdId, { mode });
  if (wantsDemo) {
    const user = (await sessionFor(profile!.id))!;
    await seedDemo(user, { withMembers: mode === "create" });
  }
  return json({ token }, 201);
});

async function sessionFor(profileId: string) {
  return one<SessionUser>(
    `SELECT id, household_id, name, email, role, avatar_color, timezone, digest_hour, '' AS session_id
       FROM profiles WHERE id = $1`,
    [profileId],
  );
}

route("POST", "auth/login", async ({ request }) => {
  const body = await readJson(request);
  const email = str(body, "email", { max: 120, label: "e-mail" })!.toLowerCase();
  const password = str(body, "password", { max: 200, label: "senha" })!;
  await rateLimit(`login-ip:${clientIp(request)}`, 30, 15);
  await rateLimit(`login:${email}`, 8, 15);
  const profile = await one<{ id: string; password_hash: string }>(
    `SELECT id, password_hash FROM profiles WHERE lower(email) = $1 AND NOT is_demo`,
    [email],
  );
  // Sem conta: compara com um hash falso para o tempo de resposta não revelar quais e-mails existem
  const valid = await verifyPassword(password, profile ? profile.password_hash : await dummyHash());
  if (!profile || !valid)
    throw new HttpError(401, "E-mail ou senha incorretos");
  const token = await createSession(profile.id, request.headers.get("user-agent"));
  return json({ token });
});

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword("conta-inexistente"));

route("POST", "auth/logout", async ({ request }) => {
  await endSession(request);
  return json({ ok: true });
});

async function loadMe(user: SessionUser): Promise<Me> {
  const [household, members, accounts, pending, demo, notify] = await batch(
    [
      q(`SELECT id, name, invite_code FROM households WHERE id = $1`, [user.household_id]),
      q(
        `SELECT id, name, avatar_color, is_demo, role FROM profiles WHERE household_id = $1 ORDER BY is_demo, created_at, name, id`,
        [user.household_id],
      ),
      q(
        `SELECT id, name, kind, institution, last4, active, last_synced_at, closing_day, due_day FROM financial_accounts
          WHERE profile_id = $1 ORDER BY active DESC, created_at, name, id`,
        [user.id],
      ),
      q(`SELECT count(*)::int AS n FROM transactions WHERE profile_id = $1 AND status = 'pending' AND NOT ignored`, [user.id]),
      q(
        `SELECT EXISTS (SELECT 1 FROM transactions WHERE profile_id = $1 AND source = 'demo')
             OR EXISTS (SELECT 1 FROM profiles WHERE household_id = $2 AND is_demo) AS has_demo`,
        [user.id, user.household_id],
      ),
      q(`SELECT notify_digest FROM profiles WHERE id = $1`, [user.id]),
    ],
    { readOnly: true },
  );
  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarColor: user.avatar_color,
      digestHour: user.digest_hour,
      timezone: user.timezone,
    },
    household: {
      id: household[0].id as string,
      name: household[0].name as string,
      inviteCode: household[0].invite_code as string,
      members: members.map((m) => ({
        id: m.id as string,
        name: m.name as string,
        avatarColor: m.avatar_color as string,
        isDemo: Boolean(m.is_demo),
        role: m.role as "admin" | "member",
        isMe: m.id === user.id,
      })),
    },
    accounts: await withBalances(user, accounts),
    pendingCount: num(pending[0].n),
    notifyDigest: Boolean(notify[0]?.notify_digest),
    aiEnabled: aiEnabled(),
    voiceEnabled: transcriptionEnabled(),
    hasDemoData: Boolean(demo[0].has_demo),
    today: todayKey(user.timezone),
  };
}

async function withBalances(user: SessionUser, rows: Record<string, unknown>[]) {
  const balances = await accountBalances(user, todayKey(user.timezone));
  return rows.map((a) => mapAccount(a, balances.get(a.id as string)));
}

const NO_BALANCE = { balanceCents: null, balanceOn: null, currentBalanceCents: null, monthSpentCents: 0, history: [] };

function mapAccount(a: Record<string, unknown>, balance: Pick<Account, "balanceCents" | "balanceOn" | "currentBalanceCents" | "monthSpentCents" | "history"> = NO_BALANCE): Account {
  return {
    ...balance,
    id: a.id as string,
    name: a.name as string,
    kind: a.kind as Account["kind"],
    institution: (a.institution as string | null) ?? null,
    last4: (a.last4 as string | null) ?? null,
    active: Boolean(a.active),
    lastSyncedAt: a.last_synced_at ? new Date(a.last_synced_at as string).toISOString() : null,
    closingDay: (a.closing_day as number | null) ?? null,
    dueDay: (a.due_day as number | null) ?? null,
  };
}

route("GET", "me", async ({ request }) => json(await loadMe(await requireUser(request))));

route("PATCH", "me", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const name = body.name === undefined ? user.name : str(body, "name", { max: 60, label: "nome" })!;
  const digestHour = body.digestHour === undefined ? user.digest_hour : int(body, "digestHour", 0, 23, "horário do resumo");
  const queries = [q(`UPDATE profiles SET name = $2, digest_hour = $3 WHERE id = $1`, [user.id, name, digestHour])];
  if (body.notifyDigest !== undefined) queries.push(q(`UPDATE profiles SET notify_digest = $2 WHERE id = $1`, [user.id, bool(body, "notifyDigest")]));
  if (body.householdName !== undefined) {
    if (user.role !== "admin") throw new HttpError(403, "Só quem administra a família pode mudar o nome dela");
    queries.push(q(`UPDATE households SET name = $2 WHERE id = $1`, [user.household_id, str(body, "householdName", { max: 60 })]));
  }
  await batch(queries);
  return json(await loadMe(await requireUser(request)));
});

route("POST", "household/invite", async ({ request }) => {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new HttpError(403, "Só quem administra a família pode gerar um novo código");
  await query(`UPDATE households SET invite_code = $2 WHERE id = $1`, [user.household_id, newInviteCode()]);
  return json(await loadMe(user));
});

route("POST", "demo/clear", async ({ request }) => {
  const user = await requireUser(request);
  await clearDemo(user);
  await audit(user.id, "demo.cleared");
  return json(await loadMe(user));
});

route("POST", "demo/load", async ({ request }) => {
  const user = await requireUser(request);
  if (await one(`SELECT 1 FROM transactions WHERE profile_id = $1 AND source = 'demo'`, [user.id]))
    throw new HttpError(409, "Os dados de exemplo já estão carregados");
  const hasMembers = await one(`SELECT 1 FROM profiles WHERE household_id = $1 AND is_demo`, [user.household_id]);
  await seedDemo(user, { withMembers: user.role === "admin" && !hasMembers });
  return json(await loadMe(user));
});

// ===========================================================================
// Painéis

function currentMonth(user: SessionUser) {
  return monthOf(todayKey(user.timezone));
}

route("GET", "overview", async ({ request, url }) => {
  const user = await requireUser(request);
  const month = monthParam(url, currentMonth(user));
  const today = todayKey(user.timezone);
  const [family, mine, recent, alerts, budgets, due, invoices] = await Promise.all([
    familyNumbers(user, month, 7),
    personalNumbers(user, month, 2),
    listTransactions(user, { limit: 6 }),
    loadAlerts(user),
    listBudgets(user, month),
    payablesDue(user, today),
    cardInvoices(user, today),
  ]);
  const budgetSummary = summarize([...budgets.personal, ...budgets.family]);
  const insights: Insight[] = [];
  if (due.length) {
    const first = due[0];
    insights.push({
      id: "payables",
      icon: first.status === "overdue" ? "🚨" : "📅",
      title: due.length === 1 ? `${first.name}: ${first.status === "overdue" ? "venceu" : first.daysLeft === 0 ? "vence hoje" : `vence em ${first.daysLeft} dia(s)`}` : `${due.length} contas vencendo`,
      text: `${formatMoney(due.reduce((sum, p) => sum + p.amountCents, 0))} para pagar. Toque em “Paguei” quando quitar.`,
      page: "pagar",
    });
  }
  const invoiceDue = invoices.find((i) => i.status !== "future" && i.totalCents > 0 && daysBetweenKeys(today, i.dueOn) <= 5);
  if (invoiceDue)
    insights.push({
      id: `invoice-${invoiceDue.accountId}`,
      icon: "💳",
      title: `Fatura ${invoiceDue.accountName}: ${formatMoney(invoiceDue.totalCents)}`,
      text: `Vence ${invoiceDue.dueOn.slice(8, 10)}/${invoiceDue.dueOn.slice(5, 7)}${invoiceDue.status === "open" ? " (ainda aberta)" : ""}.`,
      page: "pagar",
    });
  if (["11", "12"].includes(today.slice(5, 7)) && insights.length < 3)
    insights.push({
      id: "decimo-terceiro",
      icon: "🎁",
      title: "13º salário chegando",
      text: "Antes de gastar, separe para IPVA, IPTU e material escolar do começo do ano. Veja as contas sazonais em “Contas a pagar”.",
      page: "pagar",
    });
  const overBudget = [...budgets.personal, ...budgets.family].sort((a, b) => b.ratio - a.ratio)[0];
  if (overBudget && overBudget.ratio >= 0.8)
    insights.push({
      id: `budget-${overBudget.id}`,
      icon: overBudget.ratio > 1 ? "🚨" : "⚠️",
      title: `${CATEGORY_BY_ID.get(overBudget.categoryId)?.name ?? "Categoria"}: ${Math.round(overBudget.ratio * 100)}% do orçamento${overBudget.scope === "family" ? " da casa" : ""}`,
      text: `${formatMoney(overBudget.spentCents)} de ${formatMoney(overBudget.limitCents)} neste mês.`,
      page: "orcamento",
    });
  if (mine.counts.pending > 0)
    insights.push({
      id: "pending",
      icon: "📌",
      title: `${mine.counts.pending} compra${mine.counts.pending > 1 ? "s" : ""} para revisar`,
      text: "Classifique tudo de uma vez no resumo diário. Dá para dividir uma compra em várias categorias.",
      page: "transacoes?filtro=pendentes",
    });
  const alert = alerts.alerts[0];
  if (alert) insights.push({ id: alert.key, icon: alert.type === "increase" ? "📈" : alert.type === "duplicate" ? "🔁" : "⚠️", title: alert.title, text: alert.text, page: "alertas" });
  if (alerts.commitments.totalCents > 0 && insights.length < 2)
    insights.push({
      id: "commitments",
      icon: "🗓️",
      title: `${formatMoney(alerts.commitments.totalCents)} já comprometidos em ${monthLabel(alerts.commitments.month).split(" ")[0]}`,
      text: `${alerts.commitments.items.length} assinaturas, contas e parcelas previstas para o mês que vem.`,
      page: "alertas",
    });
  if (alerts.recurring.length)
    insights.push({
      id: "recurring",
      icon: "🔄",
      title: `${alerts.recurring.length} cobranças recorrentes`,
      text: `Somam cerca de ${formatMoney(alerts.monthlyRecurringCents)} por mês. A Nia avisa se alguma aumentar.`,
      page: "alertas",
    });
  const previous = mine.series[0]?.expenseCents ?? 0;
  if (previous > 0 && insights.length < 3) {
    const diff = Math.round(((mine.totals.expenseCents - previous) / previous) * 100);
    insights.push({
      id: "trend",
      icon: diff <= 0 ? "🌱" : "🧭",
      title: diff <= 0 ? "Gastos sob controle" : "Gastos acima do mês passado",
      text: `Seus gastos de ${monthLabel(month).split(" ")[0]} estão ${Math.abs(diff)}% ${diff <= 0 ? "abaixo" : "acima"} do total de ${monthLabel(addMonths(month, -1)).split(" ")[0]}.`,
      page: "meu",
    });
  }
  insights.push({
    id: "privacy",
    icon: "🔒",
    title: "Sua privacidade está protegida",
    text: "A família só vê os totais do que você marcar como familiar — nunca seu extrato, lojas ou comprovantes.",
  });
  const result: Overview = {
    month,
    family: { ...family.totals, previousExpenseCents: family.previousExpenseCents },
    familyCategories: family.categories,
    familySeries: family.series,
    mine: mine.totals,
    pendingCount: mine.counts.pending,
    recent,
    insights: insights.slice(0, 3),
    dataWarning: family.dataWarning,
    budgets: budgetSummary,
    // Nos 7 primeiros dias do mês atual, oferece o fechamento do mês anterior
    closingMonth: month === currentMonth(user) && Number(todayKey(user.timezone).slice(8, 10)) <= 7 ? addMonths(month, -1) : null,
  };
  return json(result);
});

route("GET", "personal", async ({ request, url }) => {
  const user = await requireUser(request);
  const month = monthParam(url, currentMonth(user));
  const [numbers, transactions] = await Promise.all([personalNumbers(user, month, 6), listTransactions(user, { month, limit: 12 })]);
  const result: Personal = { month, ...numbers, transactions };
  return json(result);
});

route("GET", "family", async ({ request, url }) => {
  const user = await requireUser(request);
  const month = monthParam(url, currentMonth(user));
  const [numbers, goals, members] = await Promise.all([
    familyNumbers(user, month, 6),
    listGoals(user),
    query(`SELECT name, avatar_color, is_demo FROM profiles WHERE household_id = $1 ORDER BY is_demo, created_at, name, id`, [user.household_id]),
  ]);
  const { incomeCents, balanceCents } = numbers.totals;
  const result: Family = {
    month,
    totals: numbers.totals,
    savingsRate: incomeCents > 0 ? balanceCents / incomeCents : null,
    categories: numbers.categories,
    series: numbers.series,
    goals: goals.filter((g) => g.scope === "family"),
    members: members.map((m) => ({ name: m.name as string, avatarColor: m.avatar_color as string, isDemo: Boolean(m.is_demo) })),
    dataWarning: numbers.dataWarning,
  };
  return json(result);
});

// ===========================================================================
// Transações

route("GET", "transactions", async ({ request, url }) => {
  const user = await requireUser(request);
  const month = url.searchParams.get("month");
  const accountId = url.searchParams.get("account");
  return json(
    await listTransactions(user, {
      month: month && /^\d{4}-\d{2}$/.test(month) ? month : undefined,
      q: url.searchParams.get("q")?.slice(0, 60) || undefined,
      status: url.searchParams.get("status") ?? undefined,
      scope: url.searchParams.get("scope") ?? undefined,
      accountId: accountId ? uuid(accountId, "conta") : undefined,
      limit: 500,
    }),
  );
});

route("POST", "transactions", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await rateLimit(`tx:${user.id}`, 120, 10); // cada lançamento sem categoria pode consultar a IA
  // Lançamento feito sem internet e reenviado: devolve o que já foi gravado
  const clientRef = str(body, "clientRef", { max: 64, optional: true });
  if (clientRef) {
    const existing = await one<{ id: string }>(`SELECT id FROM transactions WHERE profile_id = $1 AND client_ref = $2`, [user.id, clientRef]);
    if (existing) return json(await getTransaction(user, existing.id), 200);
  }
  const description = str(body, "description", { max: 120, label: "descrição" })!;
  const amountCents = cents(body.amountCents);
  const direction = oneOf(body.direction ?? "expense", ["expense", "income", "transfer"] as const, "tipo");
  const occurredOn = body.occurredOn === undefined ? todayKey(user.timezone) : dateKey(body.occurredOn);
  const accountId = body.accountId ? uuid(body.accountId, "conta") : null;
  await assertAccount(user, accountId);
  const source = oneOf(body.source ?? "manual", ["manual", "voice", "receipt"] as const, "origem");

  let allocations: Allocation[] = [];
  let status: "pending" | "auto" | "confirmed" = "confirmed";
  let classifiedBy: "user" | "rule" | "history" | "keyword" | "ai" | null = "user";
  let finalDirection: "expense" | "income" | "transfer" = direction;
  if (body.allocations !== undefined && body.allocations !== null) {
    allocations = parseAllocations(body.allocations);
    validateAllocations(direction, amountCents, allocations);
  } else if (direction === "transfer") {
    allocations = [{ categoryId: "transferencia", amountCents, scope: "personal" }];
  } else {
    // Sem categoria informada: o motor de classificação decide (ou vira pendência)
    const c = await classify(user.id, { description, merchant: normalizeMerchant(description), direction }, { useAi: true });
    finalDirection = c.direction;
    status = c.status;
    classifiedBy = c.classifiedBy;
    allocations = c.allocation ? [{ ...c.allocation, amountCents }] : [];
  }
  const id = await insertTransaction(user, {
    description,
    amountCents,
    direction: finalDirection,
    occurredOn,
    accountId,
    method: str(body, "method", { max: 40, optional: true }),
    source,
    status,
    classifiedBy,
    allocations,
    notes: str(body, "notes", { max: 300, optional: true }),
    clientRef,
  });
  await audit(user.id, "transaction.created", "transaction", id, { source });
  return json(await getTransaction(user, id), 201);
});

route("PATCH", "transactions/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const tx = await getTransaction(user, uuid(params[0]));
  const manual = tx.source === "manual" || tx.source === "voice" || tx.source === "receipt" || tx.source === "demo";
  const direction = body.direction === undefined ? tx.direction : oneOf(body.direction, ["expense", "income", "transfer"] as const, "tipo");
  // O registro original do banco é preservado: valor, data e descrição só mudam em lançamentos manuais.
  const amountCents = body.amountCents !== undefined && manual ? cents(body.amountCents) : tx.amountCents;
  const description =
    body.description !== undefined && manual ? str(body, "description", { max: 120, label: "descrição" })! : tx.description;
  const occurredOn = body.occurredOn !== undefined && manual ? dateKey(body.occurredOn) : tx.occurredOn;
  let allocations: Allocation[] | null = null;
  if (body.allocations !== undefined) {
    allocations = direction === "transfer" ? [{ categoryId: "transferencia", amountCents, scope: "personal" }] : parseAllocations(body.allocations);
    validateAllocations(direction, amountCents, allocations);
  } else if (direction !== tx.direction || amountCents !== tx.amountCents) {
    if (direction === "transfer") allocations = [{ categoryId: "transferencia", amountCents, scope: "personal" }];
    else throw new HttpError(400, "Informe as categorias para esse tipo de movimentação");
  }
  const ignored = body.ignored === undefined ? tx.ignored : bool(body, "ignored");
  const notes = body.notes === undefined ? tx.notes : str(body, "notes", { max: 300, optional: true });

  const queries = [
    q(
      `UPDATE transactions SET description = $3, merchant = $4, occurred_on = $5, amount_cents = $6, direction = $7,
              ignored = $8, notes = $9, updated_at = now(),
              status = CASE WHEN $10 THEN 'confirmed' ELSE status END,
              classified_by = CASE WHEN $10 THEN 'user' ELSE classified_by END
        WHERE id = $1 AND profile_id = $2`,
      [tx.id, user.id, description, manual ? normalizeMerchant(description) : tx.merchant, occurredOn, amountCents, direction, ignored, notes, allocations !== null],
    ),
  ];
  if (allocations) {
    queries.push(q(`DELETE FROM transaction_allocations WHERE transaction_id = $1`, [tx.id]));
    queries.push(q(INSERT_ALLOCATIONS, [allocationRows(tx.id, user.id, allocations)]));
  }
  try {
    await batch(queries);
  } catch (error) {
    if ((error as { code?: string }).code === "23514") throw new HttpError(400, "A soma das categorias precisa fechar o valor da compra");
    throw error;
  }
  await audit(user.id, "transaction.updated", "transaction", tx.id, { allocations: allocations?.length ?? null, ignored });

  if (body.goalId === undefined && amountCents !== tx.amountCents && tx.goalId)
    await query(`UPDATE goal_contributions SET amount_cents = $2 WHERE transaction_id = $1 AND profile_id = $3`, [tx.id, amountCents, user.id]);
  if (body.goalId !== undefined) {
    await linkGoal(user, { ...tx, amountCents, direction }, body.goalId === null ? null : uuid(body.goalId, "meta"), body.goalAlways === true);
  }

  let learned: { merchant: string; categoryId: string; scope: string; applied: number } | null = null;
  if (allocations && allocations.length === 1 && direction !== "transfer") {
    const merchant = manual ? normalizeMerchant(description) : tx.merchant;
    learned = await learnFromConfirmation(user.id, merchant, allocations[0].categoryId, allocations[0].scope);
  }
  return json({ transaction: await getTransaction(user, tx.id), learnedRule: learned });
});

route("POST", "transactions/:id/confirm", async ({ request, params }) => {
  const user = await requireUser(request);
  const tx = await getTransaction(user, uuid(params[0]));
  if (tx.allocations.length === 0) throw new HttpError(400, "Escolha uma categoria antes de confirmar");
  await query(`UPDATE transactions SET status = 'confirmed', classified_by = coalesce(classified_by, 'user'), updated_at = now() WHERE id = $1 AND profile_id = $2`, [tx.id, user.id]);
  return json(await getTransaction(user, tx.id));
});

route("DELETE", "transactions/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const tx = await getTransaction(user, uuid(params[0]));
  if (tx.source === "csv" || tx.source === "ofx") {
    // Importadas nunca somem: ficam ignoradas (e não voltam ao reimportar o extrato)
    await query(`UPDATE transactions SET ignored = true, updated_at = now() WHERE id = $1 AND profile_id = $2`, [tx.id, user.id]);
  } else {
    await query(`DELETE FROM transactions WHERE id = $1 AND profile_id = $2`, [tx.id, user.id]);
  }
  await audit(user.id, "transaction.deleted", "transaction", tx.id, { source: tx.source });
  return json({ ok: true });
});

// ===========================================================================
// Contas e importação

route("POST", "accounts", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const count = await one<{ n: number }>(`SELECT count(*)::int AS n FROM financial_accounts WHERE profile_id = $1`, [user.id]);
  if ((count?.n ?? 0) >= 20) throw new HttpError(400, "Limite de 20 contas");
  const last4 = str(body, "last4", { max: 4, optional: true });
  if (last4 && !/^\d{4}$/.test(last4)) throw new HttpError(400, "Final do cartão/conta: 4 números");
  const row = await one(
    `INSERT INTO financial_accounts (profile_id, name, kind, institution, last4) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      user.id,
      str(body, "name", { max: 60, label: "nome da conta" }),
      oneOf(body.kind, ["checking", "credit_card", "savings", "cash", "other"] as const, "tipo de conta"),
      str(body, "institution", { max: 60, optional: true }),
      last4,
    ],
  );
  return json(mapAccount(row!), 201);
});

route("PATCH", "accounts/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const id = uuid(params[0]);
  const current = await one<{ name: string; active: boolean; balance_cents: string | null; balance_on: string | null; closing_day: number | null; due_day: number | null }>(
    `SELECT name, active, balance_cents, balance_on::text AS balance_on, closing_day, due_day FROM financial_accounts WHERE id = $1 AND profile_id = $2`,
    [id, user.id],
  );
  if (!current) throw new HttpError(404, "Conta não encontrada");
  // Saldo informado: aceita negativo (cheque especial); null apaga
  let balanceCents = current.balance_cents === null ? null : num(current.balance_cents);
  let balanceOn = current.balance_on;
  if (body.balanceCents !== undefined) {
    if (body.balanceCents === null) [balanceCents, balanceOn] = [null, null];
    else {
      const value = Number(body.balanceCents);
      if (!Number.isInteger(value) || Math.abs(value) > 10_000_000_000) throw new HttpError(400, "Saldo inválido");
      balanceCents = value;
      balanceOn = body.balanceOn ? dateKey(body.balanceOn, "data do saldo") : todayKey(user.timezone);
    }
  }
  const cardDay = (key: "closingDay" | "dueDay", currentValue: number | null) =>
    body[key] === undefined ? currentValue : body[key] === null ? null : int(body, key, 1, 31, key === "closingDay" ? "dia do fechamento" : "dia do vencimento");
  const row = await one(
    `UPDATE financial_accounts SET name = $3, active = $4, balance_cents = $5, balance_on = $6, closing_day = $7, due_day = $8
      WHERE id = $1 AND profile_id = $2 RETURNING *`,
    [
      id,
      user.id,
      body.name === undefined ? current.name : str(body, "name", { max: 60 }),
      body.active === undefined ? current.active : bool(body, "active"),
      balanceCents,
      balanceOn,
      cardDay("closingDay", current.closing_day),
      cardDay("dueDay", current.due_day),
    ],
  );
  return json((await withBalances(user, [row!]))[0]);
});

route("POST", "import", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request, 3 * 1024 * 1024);
  await rateLimit(`import:${user.id}`, 30, 60);
  return json(
    await importStatement(user, {
      accountId: uuid(body.accountId, "conta"),
      fileName: str(body, "fileName", { max: 200, label: "arquivo" })!,
      content: typeof body.content === "string" ? body.content : "",
      invertSigns: body.invertSigns === true,
      commit: body.commit === true,
    }),
  );
});

// ===========================================================================
// Metas

route("GET", "goals", async ({ request }) => json(await listGoals(await requireUser(request))));

route("POST", "goals", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const row = await one<{ id: string }>(
    `INSERT INTO financial_goals (household_id, owner_id, name, icon, target_cents, scope, deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      user.household_id,
      user.id,
      str(body, "name", { max: 60, label: "nome da meta" }),
      str(body, "icon", { max: 8, optional: true }) ?? "🎯",
      cents(body.targetCents, "valor da meta"),
      oneOf(body.scope, ["personal", "family"] as const, "tipo de meta"),
      body.deadline ? dateKey(body.deadline, "prazo") : null,
    ],
  );
  await audit(user.id, "goal.created", "goal", row!.id);
  return json(await listGoals(user), 201);
});

route("POST", "goals/:id/contributions", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const id = uuid(params[0]);
  const goal = await one(
    `SELECT 1 FROM financial_goals WHERE id = $1 AND household_id = $2 AND (scope = 'family' OR owner_id = $3)`,
    [id, user.household_id, user.id],
  );
  if (!goal) throw new HttpError(404, "Meta não encontrada");
  const amount = Number(body.amountCents);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000_000) throw new HttpError(400, "Valor inválido");
  if (amount < 0) {
    const mine = await one<{ cents: string }>(`SELECT coalesce(sum(amount_cents), 0) AS cents FROM goal_contributions WHERE goal_id = $1 AND profile_id = $2`, [id, user.id]);
    if (num(mine?.cents) + amount < 0) throw new HttpError(400, "Você não pode retirar mais do que contribuiu");
  }
  await query(`INSERT INTO goal_contributions (goal_id, profile_id, amount_cents) VALUES ($1, $2, $3)`, [id, user.id, amount]);
  return json(await listGoals(user));
});

route("DELETE", "goals/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const row = await one(`DELETE FROM financial_goals WHERE id = $1 AND owner_id = $2 RETURNING id`, [uuid(params[0]), user.id]);
  if (!row) throw new HttpError(403, "Só quem criou a meta pode apagá-la");
  return json(await listGoals(user));
});

// ===========================================================================
// Assinaturas, alertas, saúde e regras

route("GET", "alerts", async ({ request }) => json(await loadAlerts(await requireUser(request))));

route("POST", "alerts/dismiss", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const key = str(body, "key", { max: 200 })!;
  await query(`INSERT INTO alert_dismissals (profile_id, alert_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, key]);
  return json(await loadAlerts(user));
});

route("GET", "health", async ({ request }) => {
  const user = await requireUser(request);
  const month = currentMonth(user);
  const [accounts, counts, imports] = await batch(
    [
      q(`SELECT id, name, kind, last_synced_at FROM financial_accounts WHERE profile_id = $1 AND active ORDER BY created_at, name, id`, [user.id]),
      q(
        `SELECT count(*) FILTER (WHERE status <> 'pending')::int AS classified, count(*)::int AS total,
                count(*) FILTER (WHERE status = 'pending')::int AS pending
           FROM transactions WHERE profile_id = $1 AND NOT ignored AND direction <> 'transfer' AND occurred_on >= $2`,
        [user.id, `${month}-01`],
      ),
      q(
        `SELECT r.id, fa.name AS account_name, r.format, r.file_name, r.status, r.rows_total, r.rows_imported,
                r.rows_duplicated, r.created_at
           FROM import_runs r LEFT JOIN financial_accounts fa ON fa.id = r.account_id
          WHERE r.profile_id = $1 ORDER BY r.created_at DESC LIMIT 8`,
        [user.id],
      ),
    ],
    { readOnly: true },
  );
  const alerts = await loadAlerts(user);
  const sources: SourceHealth[] = accounts.map((a) => {
    const last = a.last_synced_at ? new Date(a.last_synced_at as string) : null;
    const daysSince = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null;
    const cash = a.kind === "cash";
    const status: SourceHealth["status"] =
      daysSince === null ? (cash ? "ok" : "never") : daysSince <= 3 || cash ? "ok" : daysSince <= 7 ? "warn" : "stale";
    return {
      accountId: a.id as string,
      name: a.name as string,
      kind: a.kind as SourceHealth["kind"],
      lastSyncedAt: last?.toISOString() ?? null,
      daysSince,
      status,
    };
  });
  const result: Health = {
    sources,
    coverage: { covered: sources.filter((s) => s.status === "ok" || s.status === "warn").length, total: sources.length },
    classification: { classified: num(counts[0].classified), total: num(counts[0].total) },
    pending: num(counts[0].pending),
    duplicates: alerts.alerts.filter((a) => a.type === "duplicate").length,
    warning: sources.some((s) => s.status === "stale" || s.status === "never"),
    imports: imports.map((r) => ({
      id: r.id as string,
      accountName: (r.account_name as string | null) ?? null,
      format: r.format as string,
      fileName: (r.file_name as string | null) ?? null,
      status: r.status as "success" | "failed",
      rowsTotal: num(r.rows_total),
      rowsImported: num(r.rows_imported),
      rowsDuplicated: num(r.rows_duplicated),
      createdAt: new Date(r.created_at as string).toISOString(),
    })),
  };
  return json(result);
});

route("GET", "rules", async ({ request }) => {
  const user = await requireUser(request);
  const rows = await query(
    `SELECT id, merchant, category_id, scope, origin, active, hits, created_at FROM categorization_rules
      WHERE profile_id = $1 ORDER BY active DESC, hits DESC, created_at DESC`,
    [user.id],
  );
  return json(
    rows.map(
      (r): Rule => ({
        id: r.id as string,
        merchant: r.merchant as string,
        categoryId: r.category_id as string,
        scope: r.scope as Rule["scope"],
        origin: r.origin as Rule["origin"],
        active: Boolean(r.active),
        hits: num(r.hits),
        createdAt: new Date(r.created_at as string).toISOString(),
      }),
    ),
  );
});

route("PATCH", "rules/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const row = await one(
    `UPDATE categorization_rules SET active = $3, version = version + 1, updated_at = now()
      WHERE id = $1 AND profile_id = $2 RETURNING id`,
    [uuid(params[0]), user.id, bool(body, "active")],
  );
  if (!row) throw new HttpError(404, "Regra não encontrada");
  return json({ ok: true });
});

route("DELETE", "rules/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  await query(`DELETE FROM categorization_rules WHERE id = $1 AND profile_id = $2`, [uuid(params[0]), user.id]);
  return json({ ok: true });
});

// ===========================================================================
// Nia

route("GET", "nia", async ({ request }) => json(await listMessages(await requireUser(request))));

route("POST", "nia", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await rateLimit(`nia:${user.id}`, 40, 10);
  return json(await askNia(user, str(body, "message", { max: 1000, label: "mensagem" })!));
});

route("POST", "nia/clear", async ({ request }) => {
  const user = await requireUser(request);
  await query(`DELETE FROM ai_messages WHERE profile_id = $1`, [user.id]);
  return json(await listMessages(user));
});

// Mensagem de voz: o áudio vem do celular, vira texto e é descartado (nada fica guardado).
route("POST", "nia/transcribe", async ({ request }) => {
  const user = await requireUser(request);
  if (!transcriptionEnabled()) throw new HttpError(503, "Mensagens de voz precisam de uma chave de IA com transcrição (Groq ou OpenAI).");
  const body = await readJson(request, 3 * 1024 * 1024);
  await rateLimit(`voice:${user.id}`, 30, 10);
  const audio = typeof body.audio === "string" ? body.audio : "";
  const match = /^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(audio);
  if (!match) throw new HttpError(400, "Áudio inválido");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 1000) throw new HttpError(400, "Áudio curto demais. Segure e fale um pouco mais.");
  const extension = match[1].includes("mp4") || match[1].includes("m4a") ? "m4a" : match[1].includes("ogg") ? "ogg" : match[1].includes("wav") ? "wav" : "webm";
  try {
    const text = await transcribe(new Blob([bytes], { type: match[1] }), `voz.${extension}`);
    if (!text) throw new HttpError(422, "Não entendi o áudio. Tente falar mais perto do microfone.");
    return json({ text });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logError(error);
    throw new HttpError(502, "A transcrição não respondeu agora. Tente de novo ou digite.");
  }
});

route("POST", "nia/receipt", async ({ request }) => {
  const user = await requireUser(request);
  if (!aiEnabled())
    throw new HttpError(503, "A leitura de notas precisa de uma chave de IA configurada no servidor (veja o README).");
  const body = await readJson(request, 4 * 1024 * 1024);
  await rateLimit(`receipt:${user.id}`, 10, 60);
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw new HttpError(400, "Envie uma foto (JPG, PNG ou WEBP)");
  const reading = await readReceiptWithAi(image);
  const items = (Array.isArray(reading.items) ? reading.items : [])
    .filter((i) => i && typeof i.name === "string" && Number.isInteger(i.amountCents) && i.amountCents > 0)
    .map((i) => ({
      name: i.name.slice(0, 80),
      amountCents: i.amountCents,
      categoryId: CATEGORY_BY_ID.get(i.categoryId)?.kind === "expense" ? i.categoryId : "outros",
    }))
    .slice(0, 60);
  const totalCents = Number.isInteger(reading.totalCents) && reading.totalCents > 0 ? reading.totalCents : items.reduce((s, i) => s + i.amountCents, 0);
  const occurredOn = reading.date && isDateKey(reading.date) ? reading.date : null;
  // Pareia com uma compra já lançada (mesmo valor, perto da data) para não criar despesa duplicada
  const match = totalCents
    ? await one<{ id: string; description: string; occurred_on: string }>(
        `SELECT id, description, occurred_on::text AS occurred_on FROM transactions
          WHERE profile_id = $1 AND direction = 'expense' AND NOT ignored AND amount_cents = $2
            AND occurred_on BETWEEN $3::date - 5 AND $3::date + 5
          ORDER BY abs(occurred_on - $3::date) LIMIT 1`,
        [user.id, totalCents, occurredOn ?? todayKey(user.timezone)],
      )
    : null;
  const result: ReceiptReading = {
    merchant: reading.merchant ? String(reading.merchant).slice(0, 80) : null,
    occurredOn,
    totalCents,
    items,
    match: match ? { transactionId: match.id, description: match.description, occurredOn: match.occurred_on } : null,
  };
  return json(result);
});

// ===========================================================================
// Senha

route("POST", "auth/forgot", async ({ request }) => {
  const body = await readJson(request);
  const email = str(body, "email", { max: 120, label: "e-mail" })!.toLowerCase();
  return json(await requestReset(email, clientIp(request)));
});

route("POST", "auth/reset", async ({ request }) => {
  const body = await readJson(request);
  const email = str(body, "email", { max: 120, label: "e-mail" })!.toLowerCase();
  const code = str(body, "code", { max: 20, label: "código" })!;
  const password = str(body, "password", { max: 200, min: 8, label: "nova senha" })!;
  return json({ token: await resetWithCode(email, code, password, request.headers.get("user-agent")) });
});

route("POST", "me/password", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await changePassword(
    user,
    str(body, "current", { max: 200, label: "senha atual" })!,
    str(body, "password", { max: 200, min: 8, label: "nova senha" })!,
  );
  await audit(user.id, "password.changed");
  return json({ ok: true });
});

// ===========================================================================
// Família: papéis, saída, remoção e exclusão da conta

route("POST", "household/members/:id/role", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await setRole(user, uuid(params[0]), oneOf(body.role, ["admin", "member"] as const, "papel"));
  return json(await loadMe(user));
});

route("POST", "household/members/:id/reset-code", async ({ request, params }) => {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new HttpError(403, "Só quem administra a família pode gerar o código");
  const memberId = uuid(params[0]);
  const target = await one(`SELECT 1 FROM profiles WHERE id = $1 AND household_id = $2 AND NOT is_demo AND id <> $3`, [
    memberId,
    user.household_id,
    user.id,
  ]);
  if (!target) throw new HttpError(404, "Integrante não encontrado");
  await rateLimit(`reset-code:${user.id}`, 10, 60);
  await audit(user.id, "password.reset_code", "profile", memberId);
  return json(await createResetCode(memberId, user.id));
});

route("DELETE", "household/members/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  await removeMember(user, uuid(params[0]));
  return json(await loadMe(user));
});

route("POST", "household/leave", async ({ request }) => {
  const user = await requireUser(request);
  await leaveHousehold(user);
  return json(await loadMe((await requireUser(request))));
});

route("POST", "me/delete", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await rateLimit(`delete-account:${user.id}`, 5, 15);
  await deleteAccount(user, str(body, "password", { max: 200, label: "senha" })!);
  return json({ ok: true });
});

// ===========================================================================
// Notificações do resumo diário

route("GET", "push/key", async () => json({ publicKey: (await vapidKeys()).publicKey }));

route("POST", "push/subscribe", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const endpoint = str(body, "endpoint", { max: 1000, label: "endereço" })!;
  if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, "Endereço de notificação inválido");
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const p256dh = str(keys, "p256dh", { max: 200 })!;
  const auth = str(keys, "auth", { max: 100 })!;
  await batch([
    q(
      `INSERT INTO push_subscriptions (profile_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET profile_id = $1, p256dh = $3, auth = $4`,
      [user.id, endpoint, p256dh, auth],
    ),
    q(`UPDATE profiles SET notify_digest = true WHERE id = $1`, [user.id]),
  ]);
  return json({ ok: true });
});

route("POST", "push/unsubscribe", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const endpoint = str(body, "endpoint", { max: 1000, optional: true });
  if (endpoint) await query(`DELETE FROM push_subscriptions WHERE profile_id = $1 AND endpoint = $2`, [user.id, endpoint]);
  return json({ ok: true });
});

// Chamado de hora em hora (GitHub Actions). Público de propósito: só envia o que já está na hora
// e no máximo uma vez por dia por pessoa, então chamar a mais não muda nada.
async function cronDigest({ url }: Ctx) {
  await rateLimit("cron:digest", 30, 60);
  const appUrl = process.env.APP_URL ?? url.origin;
  return json(await sendDueDigests(appUrl.startsWith("https://") ? appUrl : "https://ninho-financas-familia.vercel.app"));
}
route("POST", "cron/digest", cronDigest);
route("GET", "cron/digest", cronDigest);

// ===========================================================================
// Orçamento

route("GET", "budgets", async ({ request, url }) => {
  const user = await requireUser(request);
  return json(await listBudgets(user, monthParam(url, currentMonth(user))));
});

route("PUT", "budgets", async ({ request, url }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const scope = oneOf(body.scope, ["personal", "family"] as const, "tipo de orçamento");
  const categoryId = str(body, "categoryId", { max: 40, label: "categoria" })!;
  if (CATEGORY_BY_ID.get(categoryId)?.kind !== "expense") throw new HttpError(400, "Escolha uma categoria de gasto");
  const limit = cents(body.limitCents, "limite");
  const rollover = body.rollover === true;
  if (scope === "family" && user.role !== "admin") throw new HttpError(403, "Só quem administra a família define o orçamento da casa");
  if (scope === "personal")
    await query(
      `INSERT INTO budgets (household_id, owner_id, scope, category_id, limit_cents, rollover) VALUES ($1, $2, 'personal', $3, $4, $5)
       ON CONFLICT (owner_id, category_id) WHERE scope = 'personal' DO UPDATE SET limit_cents = $4, rollover = $5, updated_at = now()`,
      [user.household_id, user.id, categoryId, limit, rollover],
    );
  else
    await query(
      `INSERT INTO budgets (household_id, owner_id, scope, category_id, limit_cents, rollover) VALUES ($1, NULL, 'family', $2, $3, $4)
       ON CONFLICT (household_id, category_id) WHERE scope = 'family' DO UPDATE SET limit_cents = $3, rollover = $4, updated_at = now()`,
      [user.household_id, categoryId, limit, rollover],
    );
  const result: BudgetsPayload = await listBudgets(user, monthParam(url, currentMonth(user)));
  return json(result);
});

route("DELETE", "budgets/:id", async ({ request, params, url }) => {
  const user = await requireUser(request);
  const row = await one(
    `DELETE FROM budgets WHERE id = $1 AND ((scope = 'personal' AND owner_id = $2) OR (scope = 'family' AND household_id = $3 AND $4))
     RETURNING id`,
    [uuid(params[0]), user.id, user.household_id, user.role === "admin"],
  );
  if (!row) throw new HttpError(404, "Orçamento não encontrado");
  return json(await listBudgets(user, monthParam(url, currentMonth(user))));
});

// ===========================================================================
// Fatura do cartão, contas a pagar e saldo previsto

route("GET", "invoices", async ({ request }) => {
  const user = await requireUser(request);
  return json(await cardInvoices(user, todayKey(user.timezone)));
});

function payableInput(body: Body): PayableInput {
  return {
    name: str(body, "name", { max: 60, label: "nome da conta" })!,
    categoryId: str(body, "categoryId", { max: 40, label: "categoria" })!,
    amountCents: cents(body.amountCents),
    dueOn: dateKey(body.dueOn, "vencimento"),
    recurrence: oneOf(body.recurrence ?? "monthly", ["once", "monthly", "yearly"] as const, "repetição"),
    remindDays: body.remindDays === undefined ? 3 : int(body, "remindDays", 0, 60, "aviso"),
    accountId: body.accountId ? uuid(body.accountId, "conta") : null,
    seasonal: body.seasonal === true,
  };
}

route("GET", "payables", async ({ request }) => {
  const user = await requireUser(request);
  return json(await listPayables(user, todayKey(user.timezone)));
});

route("POST", "payables", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await savePayable(user, payableInput(body));
  return json(await listPayables(user, todayKey(user.timezone)), 201);
});

route("PATCH", "payables/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await savePayable(user, payableInput(body), uuid(params[0]));
  return json(await listPayables(user, todayKey(user.timezone)));
});

route("POST", "payables/:id/pay", async ({ request, params }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const today = todayKey(user.timezone);
  await payPayable(user, uuid(params[0]), body.amountCents === undefined ? null : cents(body.amountCents), body.paidOn ? dateKey(body.paidOn) : today);
  return json(await listPayables(user, today));
});

route("DELETE", "payables/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  await deletePayable(user, uuid(params[0]));
  return json(await listPayables(user, todayKey(user.timezone)));
});

route("GET", "forecast", async ({ request, url }) => {
  const user = await requireUser(request);
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days") ?? 30) || 30));
  return json(await loadForecast(user, todayKey(user.timezone), days));
});

// ===========================================================================
// Contas da casa

route("GET", "bills", async ({ request, url }) => {
  const user = await requireUser(request);
  return json(await listBills(user, monthParam(url, currentMonth(user))));
});

route("POST", "bills", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await rateLimit(`bills:${user.id}`, 60, 60);
  const shares = Array.isArray(body.shares) ? body.shares.slice(0, 6) : [];
  const dueOn = dateKey(body.dueOn, "vencimento");
  await createBill(user, {
    name: str(body, "name", { max: 60, label: "nome da conta" })!,
    categoryId: str(body, "categoryId", { max: 40, label: "categoria" })!,
    amountCents: cents(body.amountCents),
    dueOn,
    shares: shares.map((x: Record<string, unknown>) => ({ profileId: uuid(x.profileId, "pessoa"), amountCents: Number(x.amountCents) })),
  });
  return json(await listBills(user, monthOf(dueOn)), 201);
});

route("POST", "bills/:id/pay", async ({ request, params, url }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  await payShare(user, uuid(params[0]), body.createTransaction !== false);
  return json(await listBills(user, monthParam(url, currentMonth(user))));
});

route("POST", "bills/:id/unpay", async ({ request, params, url }) => {
  const user = await requireUser(request);
  await unpayShare(user, uuid(params[0]));
  return json(await listBills(user, monthParam(url, currentMonth(user))));
});

route("POST", "bills/:id/duplicate", async ({ request, params, url }) => {
  const user = await requireUser(request);
  await duplicateBill(user, uuid(params[0]));
  return json(await listBills(user, monthParam(url, currentMonth(user))));
});

route("DELETE", "bills/:id", async ({ request, params, url }) => {
  const user = await requireUser(request);
  await deleteBill(user, uuid(params[0]));
  return json(await listBills(user, monthParam(url, currentMonth(user))));
});

// ===========================================================================
// Fechamento do mês

route("GET", "report", async ({ request, url }) => {
  const user = await requireUser(request);
  return json(await buildReport(user, monthParam(url, addMonths(currentMonth(user), -1))));
});

route("POST", "report/link", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : addMonths(currentMonth(user), -1);
  await rateLimit(`report:${user.id}`, 20, 60);
  return json({ url: await createReportLink(user, month) });
});

// Link de uso único (vence em 10 min): funciona fora do app, no navegador do celular
route("GET", "report/pdf", async ({ url }) => {
  const { user, month } = await redeemReportLink(url.searchParams.get("t") ?? "");
  const pdf = await reportPdf(user, await buildReport(user, month));
  return new Response(new Blob([new Uint8Array(pdf)]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ninho-${month}.pdf"`,
      "Cache-Control": "no-store, private",
    },
  });
});

// ===========================================================================
// Fotos das notas fiscais

route("POST", "receipts", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request, 1024 * 1024);
  await rateLimit(`receipts:${user.id}`, 30, 60);
  const id = await saveReceipt(user, typeof body.image === "string" ? body.image : "", uuid(body.transactionId, "transação"));
  return json({ id }, 201);
});

route("GET", "receipts/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  const { mime, bytes } = await receiptImage(user, uuid(params[0]));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "no-store, private" } });
});

route("DELETE", "receipts/:id", async ({ request, params }) => {
  const user = await requireUser(request);
  await deleteReceipt(user, uuid(params[0]));
  return json({ ok: true });
});

// ===========================================================================

async function dispatch(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return preflight();
  const url = new URL(request.url);
  // Na Vercel o vercel.json reescreve /api/<rota> para /api/router?route=<rota>.
  const path = (url.pathname.startsWith("/api/router") ? (url.searchParams.get("route") ?? "") : url.pathname.replace(/^\/api\/?/, ""))
    .replace(/^\/+|\/+$/g, "");
  try {
    for (const [method, pattern, handler] of routes) {
      if (method !== request.method) continue;
      const match = pattern.exec(path);
      if (match) return await handler({ request, url, params: match.slice(1) });
    }
    throw new HttpError(404, "Rota não encontrada");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    logError(error);
    return json({ error: "Algo deu errado do nosso lado. Tente de novo em instantes." }, 500);
  }
}

export async function handle(request: Request): Promise<Response> {
  return withCors(await dispatch(request), request);
}

