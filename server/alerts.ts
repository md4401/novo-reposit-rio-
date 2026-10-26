// Carrega as transações da pessoa e calcula assinaturas e alertas (sempre só do próprio perfil).
import type { AlertsPayload } from "../shared/types.js";
import { todayKey } from "../shared/time.js";
import type { SessionUser } from "./auth.js";
import { batch, num, q } from "./db.js";
import { detectAlerts, detectRecurring, monthlyRecurringCents, type TxLite } from "./insights.js";

export async function loadAlerts(user: SessionUser): Promise<AlertsPayload> {
  const today = todayKey(user.timezone);
  const [rows, dismissed] = await batch(
    [
      q(
        `SELECT t.id, t.occurred_on::text AS occurred_on, t.merchant, t.description, t.amount_cents, t.direction,
                (SELECT a.category_id FROM transaction_allocations a WHERE a.transaction_id = t.id
                  ORDER BY a.amount_cents DESC LIMIT 1) AS category_id
           FROM transactions t
          WHERE t.profile_id = $1 AND NOT t.ignored AND t.occurred_on > $2::date - 400`,
        [user.id, today],
      ),
      q(`SELECT alert_key FROM alert_dismissals WHERE profile_id = $1`, [user.id]),
    ],
    { readOnly: true },
  );
  const transactions: TxLite[] = rows.map((r) => ({
    id: r.id as string,
    occurredOn: r.occurred_on as string,
    merchant: r.merchant as string,
    description: r.description as string,
    amountCents: num(r.amount_cents),
    direction: r.direction as TxLite["direction"],
    categoryId: (r.category_id as string | null) ?? null,
  }));
  const { recurring, installments } = detectRecurring(transactions, today);
  const alerts = detectAlerts(transactions, recurring, today, new Set(dismissed.map((d) => d.alert_key as string)));
  return { recurring, installments, alerts, monthlyRecurringCents: monthlyRecurringCents(recurring) };
}
