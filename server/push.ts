// Notificação do resumo diário (Web Push). As chaves VAPID são geradas pelo próprio servidor
// na primeira vez e guardadas no banco: não há nada para configurar na Vercel.
import webpush from "web-push";
import { batch, num, one, q, query } from "./db.js";
import { logError } from "./http.js";
import type { SessionUser } from "./auth.js";
import { scamAlerts } from "./protection.js";

let keys: Promise<{ publicKey: string; privateKey: string }> | null = null;

export function vapidKeys() {
  keys ??= (async () => {
    const existing = await one<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'vapid'`);
    if (existing) return JSON.parse(existing.value);
    const generated = webpush.generateVAPIDKeys();
    await query(`INSERT INTO app_settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(generated)]);
    // Se outra função gerou ao mesmo tempo, vale a que ficou gravada
    const saved = await one<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'vapid'`);
    return JSON.parse(saved!.value);
  })().catch((error) => {
    keys = null;
    throw error;
  });
  return keys;
}

/** Envia o resumo para quem já passou do horário escolhido e ainda não recebeu hoje.
 *  Pode ser chamado várias vezes: cada pessoa recebe no máximo uma vez por dia. */
export async function sendDueDigests(appUrl: string) {
  const due = await query<{ id: string; timezone: string; today: string; pending: string; bills: string; reminders: string }>(
    `UPDATE profiles p SET last_digest_on = (now() AT TIME ZONE p.timezone)::date
      WHERE NOT p.is_demo AND p.notify_digest
        AND extract(hour FROM now() AT TIME ZONE p.timezone) >= p.digest_hour
        AND (p.last_digest_on IS NULL OR p.last_digest_on < (now() AT TIME ZONE p.timezone)::date)
        AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.profile_id = p.id)
      RETURNING p.id, p.timezone, (now() AT TIME ZONE p.timezone)::date::text AS today,
        (SELECT count(*) FROM transactions t WHERE t.profile_id = p.id AND t.status = 'pending' AND NOT t.ignored) AS pending,
        (SELECT count(*) FROM payables b WHERE b.profile_id = p.id AND b.active
            AND b.due_on - b.remind_days <= (now() AT TIME ZONE p.timezone)::date) AS bills,
        -- Garantia/documento perto de vencer, valor a receber atrasado, pontos vencendo em até 30 dias
        (SELECT count(*) FROM documents d WHERE d.profile_id = p.id AND d.expires_on IS NOT NULL
            AND d.expires_on >= (now() AT TIME ZONE p.timezone)::date AND d.expires_on - d.remind_days <= (now() AT TIME ZONE p.timezone)::date)
        + (SELECT count(*) FROM receivables r WHERE r.profile_id = p.id AND r.received_at IS NULL AND r.expected_on < (now() AT TIME ZONE p.timezone)::date)
        + (SELECT count(*) FROM loyalty l WHERE l.profile_id = p.id AND l.balance > 0 AND l.expires_on IS NOT NULL
            AND l.expires_on BETWEEN (now() AT TIME ZONE p.timezone)::date AND (now() AT TIME ZONE p.timezone)::date + 30) AS reminders`,
  );
  // Golpe suspeito vale um aviso mesmo sem pendências
  const security = new Map<string, number>();
  await Promise.all(
    due.map(async (d) => {
      try {
        security.set(d.id, (await scamAlerts({ id: d.id } as SessionUser, d.today)).length);
      } catch (error) {
        logError(error);
      }
    }),
  );
  const counts = (d: (typeof due)[number]) => ({
    pending: num(d.pending),
    bills: num(d.bills),
    reminders: num(d.reminders),
    security: security.get(d.id) ?? 0,
  });
  const withPending = due.filter((d) => Object.values(counts(d)).some((n) => n > 0));
  if (!withPending.length) return { checked: due.length, sent: 0 };
  const { publicKey, privateKey } = await vapidKeys();
  webpush.setVapidDetails(appUrl, publicKey, privateKey);
  const subs = await query<{ id: string; profile_id: string; endpoint: string; p256dh: string; auth: string }>(
    `SELECT id, profile_id, endpoint, p256dh, auth FROM push_subscriptions WHERE profile_id = ANY($1::uuid[])`,
    [withPending.map((d) => d.id)],
  );
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const d = withPending.find((x) => x.id === s.profile_id);
      // Texto genérico: a notificação aparece na tela bloqueada, sem lojas nem valores
      const payload = JSON.stringify({ title: "ninho. • resumo do dia", ...digestText(counts(d!)) });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else logError(error);
      }
    }),
  );
  if (gone.length) await batch([q(`DELETE FROM push_subscriptions WHERE id = ANY($1::uuid[])`, [gone])]);
  return { checked: due.length, sent };
}

export function digestText(c: { pending: number; bills: number; reminders?: number; security?: number }) {
  const parts: string[] = [];
  if (c.security) parts.push(`${c.security} alerta${c.security > 1 ? "s" : ""} de segurança`);
  if (c.pending) parts.push(`${c.pending} compra${c.pending > 1 ? "s" : ""} para revisar`);
  if (c.bills) parts.push(`${c.bills} conta${c.bills > 1 ? "s" : ""} vencendo`);
  if (c.reminders) parts.push(`${c.reminders} lembrete${c.reminders > 1 ? "s" : ""} (garantia, reembolso ou pontos)`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : parts[0];
  return {
    body: `Você tem ${list}.`,
    url: c.security ? "/#/seguranca" : c.pending ? "/#/transacoes?filtro=pendentes" : c.bills ? "/#/pagar" : "/#/inicio",
  };
}
