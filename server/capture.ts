// Compras capturadas das notificações do banco (APK) e textos compartilhados com o ninho.
// O celular só envia notificações de apps de banco; aqui viram lançamentos para revisar.
import { createHash } from "node:crypto";
import { BANK_PACKAGES, parseBankText } from "../shared/bank-text.js";
import { normalizeMerchant } from "../shared/merchant.js";
import type { SessionUser } from "./auth.js";
import { loadClassifier, classifyWith } from "./classify.js";
import { one } from "./db.js";
import { insertTransaction } from "./finance.js";

export type CapturedItem = { key: string; packageName: string; title: string; text: string; postedAt: number };

export async function captureNotifications(user: SessionUser, items: CapturedItem[], today: string) {
  const classifier = await loadClassifier(user.id, user.default_scope);
  let created = 0;
  let ignored = 0;
  for (const item of items.slice(0, 100)) {
    const bank = BANK_PACKAGES[item.packageName];
    const parsed = bank ? parseBankText(item.title, item.text) : null;
    if (!parsed) {
      ignored++;
      continue;
    }
    // Mesma notificação reenviada (ou lida duas vezes) não vira dois lançamentos
    const clientRef = `notif:${createHash("sha256").update(`${item.packageName}|${item.key}|${item.postedAt}`).digest("hex").slice(0, 32)}`;
    if (await one(`SELECT 1 FROM transactions WHERE profile_id = $1 AND client_ref = $2`, [user.id, clientRef])) continue;
    const occurredOn = Number.isFinite(item.postedAt) && item.postedAt > 0
      ? new Date(item.postedAt).toLocaleDateString("en-CA", { timeZone: user.timezone })
      : today;
    const c = classifyWith(classifier, { description: parsed.merchant, merchant: normalizeMerchant(parsed.merchant), direction: parsed.direction });
    await insertTransaction(user, {
      description: parsed.merchant,
      amountCents: parsed.amountCents,
      direction: c.direction,
      occurredOn: occurredOn > today ? today : occurredOn,
      accountId: null,
      method: bank,
      source: "notification",
      // Sempre para revisar: a notificação pode estar incompleta
      status: c.allocation ? "auto" : "pending",
      classifiedBy: c.classifiedBy,
      allocations: c.allocation ? [{ ...c.allocation, amountCents: parsed.amountCents }] : [],
      notes: `Capturado da notificação do ${bank}`,
      clientRef,
    });
    created++;
  }
  return { created, ignored };
}
