// Classificação automática, na ordem do caderno de produto:
//   regra da própria pessoa → histórico confirmado → palavras-chave → IA → pendência.
// Regras e histórico são sempre só do dono da transação.
import { CATEGORY_BY_ID } from "../shared/categories.js";
import { guessCategory } from "../shared/keywords.js";
import { looksLikeTransfer } from "../shared/merchant.js";
import type { ClassifiedBy, Direction, Scope, TxStatus } from "../shared/types.js";
import { aiEnabled, classifyWithAi } from "./ai.js";
import { batch, one, q, query } from "./db.js";

export type Classification = {
  direction: Direction;
  status: TxStatus;
  classifiedBy: ClassifiedBy | null;
  allocation: { categoryId: string; scope: Scope } | null;
  ruleId?: string;
};

export type Classifier = {
  rules: Map<string, { id: string; categoryId: string; scope: Scope }>;
  history: Map<string, { categoryId: string; scope: Scope }>;
};

/** Carrega regras e histórico da pessoa uma vez (importações de centenas de linhas). */
export async function loadClassifier(profileId: string): Promise<Classifier> {
  const [rules, history] = await batch(
    [
      q(`SELECT id, merchant, category_id, scope FROM categorization_rules WHERE profile_id = $1 AND active`, [profileId]),
      q(
        `SELECT DISTINCT ON (t.merchant, t.direction) t.merchant, t.direction, a.category_id, a.scope, count(*) AS n
           FROM transactions t JOIN transaction_allocations a ON a.transaction_id = t.id
          WHERE t.profile_id = $1 AND t.status = 'confirmed'
            AND (SELECT count(*) FROM transaction_allocations x WHERE x.transaction_id = t.id) = 1
          GROUP BY t.merchant, t.direction, a.category_id, a.scope
          ORDER BY t.merchant, t.direction, n DESC`,
        [profileId],
      ),
    ],
    { readOnly: true },
  );
  return {
    rules: new Map(rules.map((r) => [r.merchant as string, { id: r.id as string, categoryId: r.category_id as string, scope: r.scope as Scope }])),
    history: new Map(
      history.map((h) => [`${h.direction}|${h.merchant}`, { categoryId: h.category_id as string, scope: h.scope as Scope }]),
    ),
  };
}

export function classifyWith(ctx: Classifier, input: { description: string; merchant: string; direction: Direction }): Classification {
  // Pagamento de fatura e transferências próprias não são gastos.
  if (looksLikeTransfer(input.description)) {
    return { direction: "transfer", status: "auto", classifiedBy: "keyword", allocation: { categoryId: "transferencia", scope: "personal" } };
  }
  const direction = input.direction;
  const rule = ctx.rules.get(input.merchant);
  const ruleKind = rule ? CATEGORY_BY_ID.get(rule.categoryId)?.kind : null;
  if (rule && ruleKind === direction) {
    return { direction, status: "auto", classifiedBy: "rule", allocation: { categoryId: rule.categoryId, scope: rule.scope }, ruleId: rule.id };
  }
  const history = ctx.history.get(`${direction}|${input.merchant}`);
  if (history) return { direction, status: "auto", classifiedBy: "history", allocation: history };
  if (direction !== "transfer") {
    const guess = guessCategory(input.description, direction);
    if (guess) return { direction, status: "auto", classifiedBy: "keyword", allocation: { categoryId: guess, scope: "personal" } };
  }
  return { direction, status: "pending", classifiedBy: null, allocation: null };
}

export async function classify(
  profileId: string,
  input: { description: string; merchant: string; direction: Direction },
  opts: { useAi?: boolean } = {},
): Promise<Classification> {
  const result = classifyWith(await loadClassifier(profileId), input);
  if (result.ruleId) await query(`UPDATE categorization_rules SET hits = hits + 1 WHERE id = $1`, [result.ruleId]);
  if (result.status === "pending" && opts.useAi && aiEnabled() && input.direction === "expense") {
    const ai = await classifyWithAi(input.description).catch(() => null);
    if (ai && ai.confidence >= 0.8) {
      return { direction: input.direction, status: "auto", classifiedBy: "ai", allocation: { categoryId: ai.categoryId, scope: "personal" } };
    }
  }
  return result;
}

/**
 * Depois que a pessoa confirma uma categoria: com 2+ confirmações iguais para o mesmo
 * estabelecimento, cria uma regra aprendida (desligável) e aplica nas pendências dele.
 */
export async function learnFromConfirmation(profileId: string, merchant: string, categoryId: string, scope: Scope) {
  const existing = await one(`SELECT 1 FROM categorization_rules WHERE profile_id = $1 AND merchant = $2`, [profileId, merchant]);
  if (existing) return null;
  const confirmations = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM transactions t
      WHERE t.profile_id = $1 AND t.merchant = $2 AND t.status = 'confirmed'
        AND (SELECT count(*) FROM transaction_allocations x WHERE x.transaction_id = t.id) = 1
        AND EXISTS (SELECT 1 FROM transaction_allocations a
                     WHERE a.transaction_id = t.id AND a.category_id = $3 AND a.scope = $4)`,
    [profileId, merchant, categoryId, scope],
  );
  if ((confirmations?.n ?? 0) < 2) return null;
  const rule = await one<{ id: string }>(
    `INSERT INTO categorization_rules (profile_id, merchant, category_id, scope, origin)
     VALUES ($1, $2, $3, $4, 'learned') ON CONFLICT (profile_id, merchant) DO NOTHING RETURNING id`,
    [profileId, merchant, categoryId, scope],
  );
  if (!rule) return null;
  const applied = await applyRuleToPending(profileId, merchant, categoryId, scope);
  return { id: rule.id, merchant, categoryId, scope, applied };
}

/** Classifica as pendências de um estabelecimento com a regra (uma divisão só, valor inteiro). */
export async function applyRuleToPending(profileId: string, merchant: string, categoryId: string, scope: Scope) {
  const rows = await query<{ id: string }>(
    `WITH pending AS (
       SELECT id, amount_cents FROM transactions
        WHERE profile_id = $1 AND merchant = $2 AND status = 'pending' AND direction <> 'transfer'
          AND NOT EXISTS (SELECT 1 FROM transaction_allocations a WHERE a.transaction_id = transactions.id)
     ),
     ins AS (
       INSERT INTO transaction_allocations (transaction_id, profile_id, category_id, amount_cents, scope)
       SELECT id, $1, $3, amount_cents, $4 FROM pending
     )
     UPDATE transactions SET status = 'auto', classified_by = 'rule', updated_at = now()
      WHERE id IN (SELECT id FROM pending) RETURNING id`,
    [profileId, merchant, categoryId, scope],
  );
  return rows.length;
}
