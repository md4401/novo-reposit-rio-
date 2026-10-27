// Orçamento mensal por categoria. Pessoal: sobre o valor cheio das compras da pessoa.
// Família: sobre as partes marcadas como familiar (os mesmos números da visão da família).
import { rolloverCarry } from "../shared/planning.js";
import { monthRange } from "../shared/time.js";
import type { Budget, BudgetsPayload, BudgetSummary } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, q } from "./db.js";

export async function listBudgets(user: SessionUser, month: string): Promise<BudgetsPayload> {
  const { start, end } = monthRange(month);
  const [budgets, mine, family] = await batch(
    [
      q(
        `SELECT id, scope, category_id, limit_cents, rollover, to_char(created_at, 'YYYY-MM') AS created_month FROM budgets
          WHERE (scope = 'personal' AND owner_id = $1) OR (scope = 'family' AND household_id = $2)
          ORDER BY scope DESC, limit_cents DESC`,
        [user.id, user.household_id],
      ),
      q(
        `SELECT a.category_id, sum(a.amount_cents) AS cents
           FROM transaction_allocations a JOIN transactions t ON t.id = a.transaction_id
          WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored
            AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1`,
        [user.id, start, end],
      ),
      q(
        `SELECT a.category_id, sum(a.amount_cents) AS cents
           FROM transaction_allocations a JOIN transactions t ON t.id = a.transaction_id
           JOIN profiles p ON p.id = t.profile_id
          WHERE p.household_id = $1 AND a.scope = 'family' AND t.direction = 'expense' AND NOT t.ignored
            AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1`,
        [user.household_id, start, end],
      ),
    ],
    { readOnly: true },
  );
  const spent = (rows: typeof mine, categoryId: string) => num(rows.find((r) => r.category_id === categoryId)?.cents);
  // Acumulado: gasto de cada mês anterior desde que o limite foi criado
  const rolling = budgets.filter((b) => b.rollover && (b.created_month as string) < month);
  const history = rolling.length ? await monthlySpent(user, (rolling.map((b) => b.created_month as string).sort()[0]), month) : [];
  const map = (b: (typeof budgets)[number]): Budget => {
    const scope = b.scope as Budget["scope"];
    const spentCents = spent(scope === "family" ? family : mine, b.category_id as string);
    const limitCents = num(b.limit_cents);
    const rollover = Boolean(b.rollover);
    const carryCents = rollover
      ? rolloverCarry(
          limitCents,
          history.filter((h) => h.scope === scope && h.categoryId === b.category_id),
          b.created_month as string,
          month,
        )
      : 0;
    const effective = Math.max(1, limitCents + carryCents);
    return { id: b.id as string, scope, categoryId: b.category_id as string, limitCents, spentCents, ratio: spentCents / effective, rollover, carryCents };
  };
  const all = budgets.map(map);
  return {
    month,
    personal: all.filter((b) => b.scope === "personal"),
    family: all.filter((b) => b.scope === "family"),
    canEditFamily: user.role === "admin",
  };
}

export function summarize(budgets: Budget[]): BudgetSummary {
  return {
    total: budgets.length,
    over: budgets.filter((b) => b.ratio > 1).length,
    near: budgets.filter((b) => b.ratio >= 0.8 && b.ratio <= 1).length,
  };
}

async function monthlySpent(user: SessionUser, fromMonth: string, toMonth: string) {
  const [mine, family] = await batch(
    [
      q(
        `SELECT to_char(t.occurred_on, 'YYYY-MM') AS month, a.category_id, sum(a.amount_cents) AS cents
           FROM transaction_allocations a JOIN transactions t ON t.id = a.transaction_id
          WHERE t.profile_id = $1 AND t.direction = 'expense' AND NOT t.ignored AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1, 2`,
        [user.id, `${fromMonth}-01`, `${toMonth}-01`],
      ),
      q(
        `SELECT to_char(t.occurred_on, 'YYYY-MM') AS month, a.category_id, sum(a.amount_cents) AS cents
           FROM transaction_allocations a JOIN transactions t ON t.id = a.transaction_id JOIN profiles p ON p.id = t.profile_id
          WHERE p.household_id = $1 AND a.scope = 'family' AND t.direction = 'expense' AND NOT t.ignored
            AND t.occurred_on >= $2 AND t.occurred_on < $3
          GROUP BY 1, 2`,
        [user.household_id, `${fromMonth}-01`, `${toMonth}-01`],
      ),
    ],
    { readOnly: true },
  );
  const rows = (list: typeof mine, scope: "personal" | "family") =>
    list.map((r) => ({ scope, month: r.month as string, categoryId: r.category_id as string, cents: num(r.cents) }));
  return [...rows(mine, "personal"), ...rows(family, "family")];
}
