// Notificação do resumo diário (Web Push). As chaves VAPID são geradas pelo próprio servidor
// na primeira vez e guardadas no banco: não há nada para configurar na Vercel.
import webpush from "web-push";
import { batch, num, one, q, query } from "./db.js";
import { logError } from "./http.js";

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
  const due = await query<{ id: string; pending: string }>(
    `UPDATE profiles p SET last_digest_on = (now() AT TIME ZONE p.timezone)::date
      WHERE NOT p.is_demo AND p.notify_digest
        AND extract(hour FROM now() AT TIME ZONE p.timezone) >= p.digest_hour
        AND (p.last_digest_on IS NULL OR p.last_digest_on < (now() AT TIME ZONE p.timezone)::date)
        AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.profile_id = p.id)
      RETURNING p.id,
        (SELECT count(*) FROM transactions t WHERE t.profile_id = p.id AND t.status = 'pending' AND NOT t.ignored) AS pending`,
  );
  const withPending = due.filter((d) => num(d.pending) > 0);
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
      const n = num(withPending.find((d) => d.id === s.profile_id)?.pending);
      // Texto genérico: a notificação aparece na tela bloqueada, sem lojas nem valores
      const payload = JSON.stringify({
        title: "ninho. • resumo do dia",
        body: `Você tem ${n} compra${n > 1 ? "s" : ""} para revisar.`,
        url: "/#/transacoes?filtro=pendentes",
      });
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
