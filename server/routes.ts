// Todas as rotas da API numa única função (o plano grátis da Vercel limita o número de funções).
// Regra de ouro: toda consulta pessoal filtra por profile_id da sessão; a família só vê agregados.
import { CATEGORY_BY_ID } from "../shared/categories.js";
import { formatMoney } from "../shared/money.js";
import { normalizeMerchant } from "../shared/merchant.js";
import { addMonths, isDateKey, monthLabel, monthOf, todayKey } from "../shared/time.js";
import type {
  Account,
  Allocation,
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
  allocationRows,
  assertAccount,
  familyNumbers,
  getTransaction,
  INSERT_ALLOCATIONS,
  insertTransaction,
  listGoals,
  listTransactions,
  parseAllocations,
  personalNumbers,
  validateAllocations,
} from "./finance.js";
import {
  bool,
  cents,
  clientIp,
  dateKey,
  HttpError,
  int,
  json,
  monthParam,
  oneOf,
  preflight,
  readJson,
  str,
  uuid,
} from "./http.js";
import { askNia, listMessages } from "./nia.js";
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
  if (!profile || !(await verifyPassword(password, profile.password_hash)))
    throw new HttpError(401, "E-mail ou senha incorretos");
  const token = await createSession(profile.id, request.headers.get("user-agent"));
  return json({ token });
});

route("POST", "auth/logout", async ({ request }) => {
  await endSession(request);
  return json({ ok: true });
});

async function loadMe(user: SessionUser): Promise<Me> {
  const [household, members, accounts, pending, demo] = await batch(
    [
      q(`SELECT id, name, invite_code FROM households WHERE id = $1`, [user.household_id]),
      q(
        `SELECT id, name, avatar_color, is_demo, role FROM profiles WHERE household_id = $1 ORDER BY is_demo, created_at`,
        [user.household_id],
      ),
      q(
        `SELECT id, name, kind, institution, last4, active, last_synced_at FROM financial_accounts
          WHERE profile_id = $1 ORDER BY active DESC, created_at`,
        [user.id],
      ),
      q(`SELECT count(*)::int AS n FROM transactions WHERE profile_id = $1 AND status = 'pending' AND NOT ignored`, [user.id]),
      q(
        `SELECT EXISTS (SELECT 1 FROM transactions WHERE profile_id = $1 AND source = 'demo')
             OR EXISTS (SELECT 1 FROM profiles WHERE household_id = $2 AND is_demo) AS has_demo`,
        [user.id, user.household_id],
      ),
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
    accounts: accounts.map(mapAccount),
    pendingCount: num(pending[0].n),
    aiEnabled: aiEnabled(),
    voiceEnabled: transcriptionEnabled(),
    hasDemoData: Boolean(demo[0].has_demo),
    today: todayKey(user.timezone),
  };
}

function mapAccount(a: Record<string, unknown>): Account {
  return {
    id: a.id as string,
    name: a.name as string,
    kind: a.kind as Account["kind"],
    institution: (a.institution as string | null) ?? null,
    last4: (a.last4 as string | null) ?? null,
    active: Boolean(a.active),
    lastSyncedAt: a.last_synced_at ? new Date(a.last_synced_at as string).toISOString() : null,
  };
}

route("GET", "me", async ({ request }) => json(await loadMe(await requireUser(request))));

route("PATCH", "me", async ({ request }) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const name = body.name === undefined ? user.name : str(body, "name", { max: 60, label: "nome" })!;
  const digestHour = body.digestHour === undefined ? user.digest_hour : int(body, "digestHour", 0, 23, "horário do resumo");
  const queries = [q(`UPDATE profiles SET name = $2, digest_hour = $3 WHERE id = $1`, [user.id, name, digestHour])];
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
  const [family, mine, recent, alerts] = await Promise.all([
    familyNumbers(user, month, 7),
    personalNumbers(user, month, 2),
    listTransactions(user, { limit: 6 }),
    loadAlerts(user),
  ]);
  const insights: Insight[] = [];
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
    query(`SELECT name, avatar_color, is_demo FROM profiles WHERE household_id = $1 ORDER BY is_demo, created_at`, [user.household_id]),
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
  const current = await one<{ name: string; active: boolean }>(`SELECT name, active FROM financial_accounts WHERE id = $1 AND profile_id = $2`, [id, user.id]);
  if (!current) throw new HttpError(404, "Conta não encontrada");
  const row = await one(`UPDATE financial_accounts SET name = $3, active = $4 WHERE id = $1 AND profile_id = $2 RETURNING *`, [
    id,
    user.id,
    body.name === undefined ? current.name : str(body, "name", { max: 60 }),
    body.active === undefined ? current.active : bool(body, "active"),
  ]);
  return json(mapAccount(row!));
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
      q(`SELECT id, name, kind, last_synced_at FROM financial_accounts WHERE profile_id = $1 AND active ORDER BY created_at`, [user.id]),
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
    console.error(error);
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

export async function handle(request: Request): Promise<Response> {
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
    console.error(error);
    return json({ error: "Algo deu errado do nosso lado. Tente de novo em instantes." }, 500);
  }
}

