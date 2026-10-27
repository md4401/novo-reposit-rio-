// Orçamento mensal por categoria. Pessoal: sobre o valor cheio das compras da pessoa.
// Família: sobre as partes marcadas como familiar (os mesmos números da visão da família).
import { monthRange } from "../shared/time.js";
import type { Budget, BudgetsPayload, BudgetSummary } from "../shared/types.js";
import type { SessionUser } from "./auth.js";
import { batch, num, q } from "./db.js";

export async function listBudgets(user: SessionUser, month: string): Promise<BudgetsPayload> {
  const { start, end } = monthRange(month);
  const [budgets, mine, family] = await batch(
    [
      q(
        `SELECT id, scope, category_id, limit_cents FROM budgets
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
  const map = (b: (typeof budgets)[number]): Budget => {
    const scope = b.scope as Budget["scope"];
    const spentCents = spent(scope === "family" ? family : mine, b.category_id as string);
    const limitCents = num(b.limit_cents);
    return { id: b.id as string, scope, categoryId: b.category_id as string, limitCents, spentCents, ratio: spentCents / limitCents };
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
