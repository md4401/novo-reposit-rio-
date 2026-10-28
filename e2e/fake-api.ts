// API de mentira para os testes de tela: responde às chamadas /api/* dentro do navegador,
// guardando o estado na memória (sem banco nem servidor). Só cobre o que os fluxos testados usam;
// qualquer outra chamada vai para `unhandled`, e o teste falha mostrando qual foi.
import type { Page, Route } from "@playwright/test";
import type { Account, AccountKind, Allocation, ImportResult, ImportRow, Me, Overview, Transaction } from "../shared/types";

export const TODAY = "2026-10-27";
const TOKEN = "token-de-teste";
const PROFILE_ID = "p-ana";

export type Call = { method: string; path: string; body: unknown };

type Options = {
  /** Já entra com a sessão aberta (pula o cadastro) */
  signedIn?: boolean;
  /** Já viu as boas-vindas (para os fluxos que não testam o cadastro) */
  welcomeSeen?: boolean;
  accounts?: Partial<Account>[];
  pending?: { description: string; amountCents: number }[];
  uiMode?: Me["profile"]["uiMode"];
  /** Abertura do app (desligada nos fluxos, para os cliques não esperarem a animação) */
  intro?: "full" | "short" | "off";
};

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

function account(data: Partial<Account>): Account {
  return {
    id: id("acc"),
    name: "Conta",
    kind: "checking",
    institution: null,
    last4: null,
    active: true,
    lastSyncedAt: null,
    balanceCents: null,
    balanceOn: null,
    currentBalanceCents: null,
    monthSpentCents: 0,
    history: [],
    closingDay: null,
    dueDay: null,
    isReserve: false,
    ...data,
  };
}

function transaction(data: Partial<Transaction>): Transaction {
  const description = data.description ?? "Compra";
  return {
    id: id("tx"),
    occurredOn: TODAY,
    description,
    merchant: description.toLowerCase(),
    amountCents: 1000,
    direction: "expense",
    status: "pending",
    classifiedBy: null,
    source: "manual",
    accountId: null,
    accountName: null,
    method: null,
    ignored: false,
    notes: null,
    allocations: [],
    goalId: null,
    receiptId: null,
    tags: [],
    taxDeductible: null,
    ...data,
  };
}

/** Lê um CSV simples "data;descrição;valor" (valor negativo = gasto). */
function parseCsv(content: string): ImportRow[] {
  return content
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, description, value] = line.split(";");
      const [d, m, y] = date.split("/");
      const cents = Math.round(Number(value.replace(".", "").replace(",", ".")) * 100);
      return {
        occurredOn: `${y}-${m}-${d}`,
        description,
        amountCents: Math.abs(cents),
        direction: cents < 0 ? "expense" : "income",
        duplicate: false,
      } as ImportRow;
    });
}

export class FakeApi {
  calls: Call[] = [];
  unhandled: string[] = [];
  signedIn: boolean;
  name = "Ana Ribeiro";
  householdName = "Família de Ana";
  uiMode: Me["profile"]["uiMode"];
  accounts: Account[];
  transactions: Transaction[];

  constructor(private options: Options = {}) {
    this.signedIn = options.signedIn ?? false;
    this.uiMode = options.uiMode ?? "full";
    this.accounts = (options.accounts ?? []).map(account);
    this.transactions = (options.pending ?? []).map((p, i) =>
      transaction({ ...p, source: "csv", occurredOn: `2026-10-${String(20 + i).padStart(2, "0")}`, accountId: this.accounts[0]?.id ?? null }),
    );
  }

  async install(page: Page) {
    const signedIn = this.signedIn;
    const welcomeSeen = this.options.welcomeSeen ?? signedIn;
    const intro = this.options.intro ?? "off";
    await page.addInitScript(
      ([token, profileId, signed, seen, introMode]) => {
        // Só na primeira carga: as próximas mantêm o que o app gravou
        if (sessionStorage.getItem("e2e.ready")) return;
        sessionStorage.setItem("e2e.ready", "1");
        localStorage.clear();
        if (signed) localStorage.setItem("ninho.token", token as string);
        if (seen) localStorage.setItem(`ninho.boasvindas.${profileId}`, "1");
        localStorage.setItem("ninho.intro", introMode as string);
      },
      [TOKEN, PROFILE_ID, signedIn, welcomeSeen, intro] as const,
    );
    await page.route("**/api/**", (route) => this.handle(route));
  }

  /** Chamadas de um tipo, ex.: calls("PATCH", /^transactions\//) */
  callsTo(method: string, path: RegExp) {
    return this.calls.filter((c) => c.method === method && path.test(c.path));
  }

  private me(): Me {
    return {
      profile: { id: PROFILE_ID, name: this.name, email: "ana@exemplo.com", role: "admin", avatarColor: "#1e6650", digestHour: 20, timezone: "America/Sao_Paulo", incomeMode: "fixed", selfSalaryCents: null, uiMode: this.uiMode, hasSplitIncome: false },
      household: {
        id: "h-1",
        name: this.householdName,
        inviteCode: "ABC123",
        members: [{ id: PROFILE_ID, name: this.name, avatarColor: "#1e6650", isDemo: false, role: "admin", isMe: true, splitBp: null }],
        agreementLimitCents: null,
      },
      accounts: this.accounts,
      pendingCount: this.pending().length,
      notifyDigest: false,
      aiEnabled: false,
      voiceEnabled: false,
      hasDemoData: false,
      setup: { hasTransactions: this.transactions.length > 0, hasBudget: false, hasGoal: false },
      today: TODAY,
    };
  }

  private pending() {
    return this.transactions.filter((t) => t.status === "pending" && !t.ignored);
  }

  private overview(): Overview {
    const sum = (direction: string) => this.transactions.filter((t) => t.direction === direction && !t.ignored).reduce((s, t) => s + t.amountCents, 0);
    const mine = { incomeCents: sum("income"), expenseCents: sum("expense"), balanceCents: sum("income") - sum("expense"), previousExpenseCents: 0 };
    return {
      month: TODAY.slice(0, 7),
      family: { incomeCents: 0, expenseCents: 0, balanceCents: 0, previousExpenseCents: 0 },
      familyCategories: [],
      familySeries: [],
      mine,
      mineCategories: [],
      pendingCount: this.pending().length,
      recent: this.transactions.slice(0, 5),
      insights: [],
      actions: [],
      tips: [],
      upcoming: [],
      forecastEndOfMonthCents: null,
      dataWarning: false,
      budgets: { total: 0, over: 0, near: 0 },
      closingMonth: null,
    };
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\//, "");
    const method = request.method();
    const body = request.postData() ? (JSON.parse(request.postData()!) as Record<string, unknown>) : null;
    this.calls.push({ method, path: path + url.search, body });

    const reply = (status: number, data: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const ok = (data: unknown) => reply(200, data);

    if (method === "POST" && path === "auth/register") {
      this.name = String(body!.name);
      if (body!.householdName) this.householdName = String(body!.householdName);
      this.signedIn = true;
      return ok({ token: TOKEN });
    }
    if (!this.signedIn) return reply(401, { error: "Entre na sua conta." });

    if (method === "GET" && path === "me") return ok(this.me());
    if (method === "GET" && path === "overview") return ok(this.overview());
    if (method === "GET" && (path === "tags" || path === "goals" || path === "rules")) return ok([]);
    if (method === "GET" && path === "nia") return ok([]);

    if (method === "POST" && path === "accounts") {
      const created = account({ name: String(body!.name), kind: body!.kind as AccountKind, institution: (body!.institution as string) ?? null, last4: (body!.last4 as string) ?? null });
      this.accounts.push(created);
      return ok(created);
    }

    if (method === "GET" && path === "transactions") {
      const status = url.searchParams.get("status");
      const list = status === "pending" ? this.pending() : this.transactions;
      return ok([...list].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)));
    }
    if (method === "POST" && path === "transactions") {
      const allocations = (body!.allocations as Allocation[] | undefined) ?? [];
      const created = transaction({
        description: String(body!.description),
        amountCents: Number(body!.amountCents),
        direction: body!.direction as Transaction["direction"],
        occurredOn: String(body!.occurredOn),
        accountId: (body!.accountId as string) ?? null,
        allocations,
        status: allocations.length ? "confirmed" : "pending",
        classifiedBy: allocations.length ? "user" : null,
      });
      this.transactions.unshift(created);
      return ok(created);
    }
    const one = path.match(/^transactions\/([^/]+)$/);
    if (method === "PATCH" && one) {
      const t = this.transactions.find((x) => x.id === one[1]);
      if (!t) return reply(404, { error: "Transação não encontrada." });
      Object.assign(t, { allocations: body!.allocations, status: "confirmed", classifiedBy: "user" });
      return ok({ ...t, learnedRule: null });
    }

    if (method === "POST" && path === "import") {
      const rows = parseCsv(String(body!.content));
      const commit = Boolean(body!.commit);
      if (commit) {
        const acc = this.accounts.find((a) => a.id === body!.accountId);
        for (const { duplicate: _, ...r } of rows) this.transactions.unshift(transaction({ ...r, source: "csv", accountId: acc?.id ?? null, accountName: acc?.name ?? null }));
      }
      const result: ImportResult = { format: "csv", rows, total: rows.length, duplicates: 0, imported: commit ? rows.length : 0, committed: commit, bank: null, autoInverted: false };
      return ok(result);
    }

    this.unhandled.push(`${method} ${path}`);
    return reply(404, { error: `Não simulado no teste: ${method} ${path}` });
  }
}
