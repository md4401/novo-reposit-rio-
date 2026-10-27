// Dados de exemplo: 7 meses de movimentações da pessoa + 3 integrantes fictícios
// (Mãe, Pai, Irmão), para o app já abrir com gráficos, assinaturas, alertas e metas.
// Tudo marcado como demonstração e removível em Configurações.
import { randomUUID } from "node:crypto";
import { normalizeMerchant } from "../shared/merchant.js";
import { splitProportionally } from "../shared/money.js";
import { addDays, addMonths, daysInMonth, monthOf, todayKey } from "../shared/time.js";
import type { Scope } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, q } from "./db.js";

type Alloc = { category_id: string; amount_cents: number; scope: Scope };
type TxSeed = {
  id: string;
  profile_id: string;
  account_id: string | null;
  occurred_on: string;
  description: string;
  merchant: string;
  amount_cents: number;
  direction: "expense" | "income" | "transfer";
  status: "pending" | "auto" | "confirmed";
  classified_by: string | null;
  method: string | null;
  allocations: Alloc[];
};

function prng(seed: string) {
  let a = parseInt(seed.replace(/-/g, "").slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dias de fechamento e vencimento do cartão de exemplo (1 a 28, para valer em qualquer mês). */
function cardDays(today: string) {
  const dueDay = Math.min(28, Number(addDays(today, 4).slice(8, 10)));
  return { closing_day: ((dueDay + 20) % 28) + 1, due_day: dueDay };
}

/** Próxima data (a partir de hoje) com esse dia do mês. */
function nextDay(today: string, day: number) {
  const month = monthOf(today);
  const key = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
  return key >= today ? key : `${addMonths(month, 1)}-${String(Math.min(day, daysInMonth(addMonths(month, 1)))).padStart(2, "0")}`;
}

export async function seedDemo(user: SessionUser, opts: { withMembers: boolean }) {
  const rand = prng(user.id);
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10; // centavos "redondos"
  const today = todayKey(user.timezone);
  const currentMonth = monthOf(today);
  const months = Array.from({ length: 7 }, (_, i) => addMonths(currentMonth, -6 + i));
  const randomDay = () => 1 + Math.floor(rand() * 27);
  const dateIn = (month: string, day: number) => {
    const d = Math.min(day, daysInMonth(month));
    const key = `${month}-${String(d).padStart(2, "0")}`;
    return key <= today ? key : null;
  };

  const transactions: TxSeed[] = [];
  const add = (
    profileId: string,
    accountId: string | null,
    occurredOn: string | null,
    description: string,
    amountCents: number,
    direction: TxSeed["direction"],
    allocations: Alloc[] | null,
    status: TxSeed["status"] = "confirmed",
    classifiedBy: string | null = "user",
    method: string | null = null,
  ) => {
    if (!occurredOn) return;
    transactions.push({
      id: randomUUID(),
      profile_id: profileId,
      account_id: accountId,
      occurred_on: occurredOn,
      description,
      merchant: normalizeMerchant(description),
      amount_cents: amountCents,
      direction,
      status: allocations ? status : "pending",
      classified_by: allocations ? classifiedBy : null,
      method,
      allocations: allocations ?? [],
    });
  };
  const one = (category: string, cents: number, scope: Scope): Alloc[] => [{ category_id: category, amount_cents: cents, scope }];
  const split = (cents: number, parts: [string, number][], scope: Scope): Alloc[] => {
    const values = splitProportionally(cents, parts.map((p) => p[1]));
    return parts.map(([category], i) => ({ category_id: category, amount_cents: values[i], scope }));
  };

  // ------------------------------------------------------------------ você
  const me = user.id;
  const checking = randomUUID();
  const card = randomUUID();
  const savings = randomUUID();
  const accounts = [
    { id: checking, profile_id: me, name: "Conta corrente", kind: "checking", institution: "Banco Exemplo", last4: "0193", hours: 2 },
    // Fechamento uma semana antes do vencimento, que cai daqui a 4 dias: a fatura aparece no Início
    { id: card, profile_id: me, name: "Cartão de crédito", kind: "credit_card", institution: "Banco Exemplo", last4: "4821", hours: 74, ...cardDays(today) },
    { id: savings, profile_id: me, name: "Conta secundária", kind: "savings", institution: "Banco Digital", last4: "7710", hours: 290 },
  ];

  for (const [i, month] of months.entries()) {
    const isCurrent = month === currentMonth;
    add(me, checking, dateIn(month, 5), "Salário - Empresa Exemplo", 420000, "income", one("salario", 420000, "family"));
    const bill = between(130000, 190000);
    add(me, checking, dateIn(month, 10), "Pagamento de fatura do cartão", bill, "transfer", one("transferencia", bill, "personal"), "auto", "keyword");
    add(me, card, dateIn(month, 22), "Spotify", 2190, "expense", one("assinaturas", 2190, "personal"), "auto", "keyword", "Crédito •••• 4821");
    add(me, card, dateIn(month, 21), "NETFLIX.COM", 3990, "expense", one("assinaturas", 3990, "personal"), "auto", "rule", "Crédito •••• 4821");
    const gym = i === months.length - 1 ? 12990 : 11990; // aumento de mensalidade no último mês
    add(me, card, dateIn(month, 5), "Academia Corpo Ativo", gym, "expense", one("bem-estar", gym, "personal"), "auto", "keyword", "Crédito •••• 4821");
    for (const day of [3, 9, 16, 23, 29]) {
      if (isCurrent && day === 23) continue; // a compra dividida do exemplo entra abaixo
      const total = between(16000, 26000);
      add(me, card, dateIn(month, day), "Supermercado Pão & Cia", total, "expense",
        split(total, [["alimentacao", 62], ["limpeza", 25], ["higiene", 13]], "family"), "confirmed", "user", "Crédito •••• 4821");
    }
    for (let k = 0; k < 8; k++) {
      const v = between(1200, 4200);
      add(me, checking, dateIn(month, 2 + k * 3 + Math.floor(rand() * 2)), "Padaria da Vila", v, "expense", one("alimentacao", v, "family"), "auto", "rule", "Pix");
    }
    for (const day of [8, 22]) {
      const v = between(15000, 20000);
      add(me, card, dateIn(month, day), "Posto Estrela", v, "expense", one("transporte", v, "personal"), "auto", "keyword", "Crédito •••• 4821");
    }
    for (const day of [6, 14, 27]) {
      const v = between(3500, 7200);
      add(me, card, dateIn(month, day), "iFood *Restaurante", v, "expense", one("alimentacao", v, "personal"), "auto", "keyword", "Crédito •••• 4821");
      const u = between(1500, 3600);
      add(me, card, dateIn(month, day + 1), "Uber *Viagem", u, "expense", one("transporte", u, "personal"), "auto", "keyword", "Crédito •••• 4821");
    }
    if (!isCurrent) {
      const v = between(9000, 19000);
      add(me, card, dateIn(month, randomDay()), ["Lojas Renner", "Riachuelo", "Centauro", "Magazine Luiza", "Shopee"][i % 5], v, "expense", one("compras", v, "personal"), "confirmed", "user", "Crédito •••• 4821");
      const w = between(8000, 14000);
      add(me, card, dateIn(month, randomDay()), "Livraria Leitura", w, "expense", one("compras", w, "personal"), "confirmed", "user", "Crédito •••• 4821");
      const f = between(3000, 8000);
      add(me, checking, dateIn(month, randomDay()), "Drogaria São Paulo", f, "expense", one("saude", f, "personal"), "auto", "keyword", "Débito");
    }
    const cinema = between(3000, 6000);
    add(me, card, dateIn(month, randomDay()), "Cinemark", cinema, "expense", one("lazer", cinema, "personal"), "auto", "keyword", "Crédito •••• 4821");
    const restaurant = between(18000, 26000);
    add(me, card, dateIn(month, randomDay()), "Restaurante Sabor de Casa", restaurant, "expense", one("alimentacao", restaurant, "family"), "confirmed", "user", "Crédito •••• 4821");
  }
  // Mês atual: a compra dividida do caderno de produto, pendências, duplicidade e gasto fora do padrão
  add(me, card, addDays(today, -4), "Supermercado Pão & Cia", 24000, "expense",
    [{ category_id: "alimentacao", amount_cents: 15000, scope: "family" }, { category_id: "limpeza", amount_cents: 6000, scope: "family" }, { category_id: "higiene", amount_cents: 3000, scope: "family" }],
    "confirmed", "user", "Crédito •••• 4821");
  add(me, checking, addDays(today, -7), "Farmácia Vida", 6850, "expense", null, "pending", null, "Pix");
  add(me, card, addDays(today, -8), "Loja Central", 18750, "expense", null, "pending", null, "Crédito •••• 4821");
  add(me, checking, addDays(today, -6), "Posto Estrela", 16500, "expense", one("transporte", 16500, "personal"), "auto", "keyword", "Débito");
  add(me, checking, addDays(today, -6), "Posto Estrela", 16500, "expense", one("transporte", 16500, "personal"), "auto", "keyword", "Débito");
  add(me, card, addDays(today, -12), "Loja Eletrônicos Ltda", 129900, "expense", one("compras", 129900, "personal"), "confirmed", "user", "Crédito •••• 4821");

  // ------------------------------------------------------------------ família fictícia
  const members: { id: string; household_id: string; name: string; avatar_color: string }[] = [];
  const goals: { id: string; owner_id: string; name: string; icon: string; target_cents: number; scope: Scope }[] = [];
  const contributions: { goal_id: string; profile_id: string; amount_cents: number }[] = [];

  const emergency = randomUUID();
  const trip = randomUUID();
  const personalGoal = randomUUID();
  goals.push({ id: personalGoal, owner_id: me, name: "Meu próximo objetivo", icon: "✨", target_cents: 300000, scope: "personal" });
  contributions.push({ goal_id: personalGoal, profile_id: me, amount_cents: 125000 });

  if (opts.withMembers) {
    const mom = randomUUID();
    const dad = randomUUID();
    const bro = randomUUID();
    members.push(
      { id: mom, household_id: user.household_id, name: "Mãe", avatar_color: "#b4514d" },
      { id: dad, household_id: user.household_id, name: "Pai", avatar_color: "#2f6f9f" },
      { id: bro, household_id: user.household_id, name: "Irmão", avatar_color: "#a36b20" },
    );
    const momAcc = randomUUID();
    const dadAcc = randomUUID();
    const broAcc = randomUUID();
    accounts.push(
      { id: momAcc, profile_id: mom, name: "Conta corrente", kind: "checking", institution: "Banco Exemplo", last4: "2231", hours: 20 },
      { id: dadAcc, profile_id: dad, name: "Conta corrente", kind: "checking", institution: "Banco Exemplo", last4: "8820", hours: 30 },
      { id: broAcc, profile_id: bro, name: "Conta digital", kind: "checking", institution: "Banco Digital", last4: "5512", hours: 5 },
    );
    for (const month of months) {
      add(mom, momAcc, dateIn(month, 5), "Salário", 520000, "income", one("salario", 520000, "family"));
      for (const day of [4, 11, 18, 25]) {
        const v = between(9000, 16000);
        add(mom, momAcc, dateIn(month, day), "Mercado Boa Compra", v, "expense", one("alimentacao", v, "family"), "auto", "keyword");
        const f = between(4000, 7000);
        add(mom, momAcc, dateIn(month, day + 2), "Feira do Bairro", f, "expense", one("alimentacao", f, "family"), "confirmed");
      }
      add(mom, momAcc, dateIn(month, 15), "Sabesp", between(8500, 11000), "expense", null);
      add(mom, momAcc, dateIn(month, 13), "Farmácia Bem", 5990, "expense", one("saude", 5990, "personal"), "auto", "keyword");

      add(dad, dadAcc, dateIn(month, 5), "Salário", 608000, "income", one("salario", 608000, "family"));
      add(dad, dadAcc, dateIn(month, 10), "Aluguel", 240000, "expense", one("moradia", 240000, "family"));
      add(dad, dadAcc, dateIn(month, 10), "Condomínio Residencial", 65000, "expense", one("moradia", 65000, "family"));
      add(dad, dadAcc, dateIn(month, 22), "Internet da Casa", 13990, "expense", one("moradia", 13990, "family"), "auto", "keyword");
      const light = between(17000, 26000);
      add(dad, dadAcc, dateIn(month, 18), "Enel Energia", light, "expense", one("moradia", light, "family"), "auto", "keyword");
      add(dad, dadAcc, dateIn(month, 7), "Plano de Saúde Família", 118000, "expense", one("saude", 118000, "family"));
      for (const day of [9, 24]) {
        const v = between(17000, 22000);
        add(dad, dadAcc, dateIn(month, day), "Posto Avenida", v, "expense", one("transporte", v, "personal"), "auto", "keyword");
      }

      add(bro, broAcc, dateIn(month, 5), "Bolsa de estágio", 150000, "income", one("salario", 150000, "personal"));
      add(bro, broAcc, dateIn(month, 22), "Música Premium", 2190, "expense", one("assinaturas", 2190, "personal"), "auto", "keyword");
      add(bro, broAcc, dateIn(month, 12), "Comgás", 12000, "expense", one("moradia", 12000, "family"), "auto", "keyword");
      const burger = between(4000, 6000);
      add(bro, broAcc, dateIn(month, 20), "Hamburgueria Z", burger, "expense", one("alimentacao", burger, "personal"), "auto", "keyword");
    }
    // As contas de água da Mãe entram como familiares (confirmadas), exceto a do mês atual
    for (const t of transactions) {
      if (t.profile_id === mom && t.description === "Sabesp" && t.occurred_on < `${currentMonth}-01`) {
        t.allocations = one("moradia", t.amount_cents, "family");
        t.status = "confirmed";
        t.classified_by = "user";
      }
    }

    goals.push(
      { id: emergency, owner_id: me, name: "Reserva de emergência", icon: "🛡️", target_cents: 1000000, scope: "family" },
      { id: trip, owner_id: mom, name: "Viagem da família", icon: "✈️", target_cents: 800000, scope: "family" },
    );
    contributions.push(
      { goal_id: emergency, profile_id: me, amount_cents: 150000 },
      { goal_id: emergency, profile_id: mom, amount_cents: 250000 },
      { goal_id: emergency, profile_id: dad, amount_cents: 200000 },
      { goal_id: emergency, profile_id: bro, amount_cents: 50000 },
      { goal_id: trip, profile_id: me, amount_cents: 80000 },
      { goal_id: trip, profile_id: mom, amount_cents: 120000 },
      { goal_id: trip, profile_id: dad, amount_cents: 120000 },
    );
  }

  const allocations = transactions.flatMap((t) =>
    t.allocations.map((a, position) => ({ transaction_id: t.id, profile_id: t.profile_id, ...a, position })),
  );
  const json = (v: unknown) => JSON.stringify(v);

  await batch([
    q(
      `INSERT INTO profiles (id, household_id, name, avatar_color, is_demo)
       SELECT x.id, x.household_id, x.name, x.avatar_color, true
         FROM json_to_recordset($1::json) AS x(id uuid, household_id uuid, name text, avatar_color text)`,
      [json(members)],
    ),
    q(
      `INSERT INTO financial_accounts (id, profile_id, name, kind, institution, last4, last_synced_at, closing_day, due_day, is_demo)
       SELECT x.id, x.profile_id, x.name, x.kind, x.institution, x.last4, now() - make_interval(hours => x.hours), x.closing_day, x.due_day, true
         FROM json_to_recordset($1::json) AS x(id uuid, profile_id uuid, name text, kind text, institution text, last4 text, hours int,
              closing_day smallint, due_day smallint)`,
      [json(accounts)],
    ),
    q(
      `INSERT INTO transactions (id, profile_id, account_id, occurred_on, description, merchant, amount_cents, direction,
                                 status, classified_by, source, method, created_at)
       SELECT x.id, x.profile_id, x.account_id, x.occurred_on, x.description, x.merchant, x.amount_cents, x.direction,
              x.status, x.classified_by, 'demo', x.method, x.occurred_on + time '12:00'
         FROM json_to_recordset($1::json) AS x(id uuid, profile_id uuid, account_id uuid, occurred_on date, description text,
              merchant text, amount_cents bigint, direction text, status text, classified_by text, method text)`,
      [json(transactions)],
    ),
    q(
      `INSERT INTO transaction_allocations (transaction_id, profile_id, category_id, amount_cents, scope, position)
       SELECT x.transaction_id, x.profile_id, x.category_id, x.amount_cents, x.scope, x.position
         FROM json_to_recordset($1::json) AS x(transaction_id uuid, profile_id uuid, category_id text, amount_cents bigint,
              scope text, position smallint)`,
      [json(allocations)],
    ),
    q(
      `INSERT INTO categorization_rules (profile_id, merchant, category_id, scope, origin, hits, is_demo)
       VALUES ($1, 'padaria da vila', 'alimentacao', 'family', 'learned', 40, true),
              ($1, 'netflix', 'assinaturas', 'personal', 'learned', 6, true)
       ON CONFLICT (profile_id, merchant) DO NOTHING`,
      [me],
    ),
    q(
      `INSERT INTO financial_goals (id, household_id, owner_id, name, icon, target_cents, scope, is_demo)
       SELECT x.id, $1, x.owner_id, x.name, x.icon, x.target_cents, x.scope, true
         FROM json_to_recordset($2::json) AS x(id uuid, owner_id uuid, name text, icon text, target_cents bigint, scope text)`,
      [user.household_id, json(goals)],
    ),
    q(
      `INSERT INTO goal_contributions (goal_id, profile_id, amount_cents)
       SELECT x.goal_id, x.profile_id, x.amount_cents FROM json_to_recordset($1::json) AS x(goal_id uuid, profile_id uuid, amount_cents bigint)`,
      [json(contributions)],
    ),
    q(
      `INSERT INTO import_runs (profile_id, account_id, format, file_name, status, rows_total, rows_imported, rows_duplicated, created_at)
       VALUES ($1, $2, 'demo', 'extrato-exemplo.csv', 'success', 62, 60, 2, now() - interval '2 hours'),
              ($1, $3, 'demo', 'fatura-exemplo.ofx', 'success', 48, 48, 0, now() - interval '74 hours'),
              ($1, $4, 'demo', 'conta-secundaria.csv', 'success', 12, 12, 0, now() - interval '290 hours')`,
      [me, checking, card, savings],
    ),
    // Contas a pagar: luz vencendo em 2 dias (aparece no Início), aluguel e o IPVA sazonal de janeiro
    q(
      `INSERT INTO payables (profile_id, name, category_id, amount_cents, due_on, recurrence, remind_days, account_id, seasonal, is_demo)
       VALUES ($1, 'Conta de luz', 'moradia', 18990, $2, 'monthly', 3, $5, false, true),
              ($1, 'Aluguel', 'moradia', 180000, $3, 'monthly', 3, $5, false, true),
              ($1, 'IPVA', 'transporte', 195000, $4, 'yearly', 15, NULL, true, true)`,
      [me, addDays(today, 2), nextDay(today, 10), `${Number(today.slice(0, 4)) + 1}-01-20`, checking],
    ),
    q(`INSERT INTO assets (profile_id, name, kind, value_cents, updated_on, is_demo) VALUES ($1, 'Reserva no Tesouro Selic', 'investment', 1250000, $2, true)`, [me, today]),
    q(
      `INSERT INTO debts (profile_id, name, balance_cents, monthly_rate_bp, min_payment_cents, is_demo)
       VALUES ($1, 'Financiamento do carro', 1840000, 149, 89000, true)`,
      [me],
    ),
  ]);
  return { transactions: transactions.length, members: members.length };
}

/** Remove os dados de exemplo da pessoa (e os integrantes fictícios, se for administradora). */
export async function clearDemo(user: SessionUser) {
  const queries = [
    q(`DELETE FROM transactions WHERE profile_id = $1 AND source = 'demo'`, [user.id]),
    q(`DELETE FROM categorization_rules WHERE profile_id = $1 AND is_demo`, [user.id]),
    q(
      `DELETE FROM financial_accounts fa WHERE fa.profile_id = $1 AND fa.is_demo
          AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = fa.id)`,
      [user.id],
    ),
    q(`DELETE FROM financial_goals WHERE owner_id = $1 AND is_demo`, [user.id]),
    q(`DELETE FROM payables WHERE profile_id = $1 AND is_demo`, [user.id]),
    q(`DELETE FROM assets WHERE profile_id = $1 AND is_demo`, [user.id]),
    q(`DELETE FROM debts WHERE profile_id = $1 AND is_demo`, [user.id]),
  ];
  if (user.role === "admin") {
    queries.push(q(`DELETE FROM financial_goals WHERE household_id = $1 AND is_demo`, [user.household_id]));
    queries.push(q(`DELETE FROM profiles WHERE household_id = $1 AND is_demo`, [user.household_id]));
  }
  await batch(queries);
}
