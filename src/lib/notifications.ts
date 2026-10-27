// Notificação do resumo diário.
// - Navegador/app instalado (PWA): Web Push enviado pelo servidor no horário escolhido.
// - APK Android: lembrete local agendado no próprio celular (funciona sem servidor).
import { LocalNotifications } from "@capacitor/local-notifications";
import { api } from "./api";
import { isNative } from "./native";

const DIGEST_ID = 2001;

export function notificationsSupported() {
  if (isNative()) return true;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function scheduleNative(hour: number) {
  await LocalNotifications.cancel({ notifications: [{ id: DIGEST_ID }] }).catch(() => undefined);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DIGEST_ID,
        title: "ninho. • resumo do dia",
        body: "Hora de revisar as compras do dia. Leva um minuto.",
        schedule: { on: { hour, minute: 0 } },
        extra: { url: "/#/transacoes?filtro=pendentes" },
      },
    ],
  });
}

/** Liga as notificações. Devolve uma mensagem de erro para mostrar, ou null se deu certo. */
export async function enableNotifications(hour: number): Promise<string | null> {
  if (isNative()) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") return "Permita as notificações do ninho nas configurações do Android.";
    await scheduleNative(hour);
  } else {
    if (!notificationsSupported()) return "Este navegador não recebe notificações. Instale o app (menu ⋮ → Instalar app).";
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "Permita as notificações do ninho no navegador.";
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await api<{ publicKey: string }>("push/key");
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await api("push/subscribe", { body: subscription.toJSON(), silent: true });
  }
  await api("me", { method: "PATCH", body: { notifyDigest: true }, silent: true });
  return null;
}

export async function disableNotifications() {
  if (isNative()) {
    await LocalNotifications.cancel({ notifications: [{ id: DIGEST_ID }] }).catch(() => undefined);
  } else if (notificationsSupported()) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api("push/unsubscribe", { body: { endpoint: subscription.endpoint }, silent: true });
      await subscription.unsubscribe();
    }
  }
  await api("me", { method: "PATCH", body: { notifyDigest: false }, silent: true });
}

/** No APK, mantém o lembrete no horário certo (ex.: depois de trocar o horário ou reinstalar). */
export async function syncNativeReminder(enabled: boolean, hour: number) {
  if (!isNative()) return;
  if (!enabled) return void LocalNotifications.cancel({ notifications: [{ id: DIGEST_ID }] }).catch(() => undefined);
  const permission = await LocalNotifications.checkPermissions().catch(() => null);
  if (permission?.display === "granted") await scheduleNative(hour).catch(() => undefined);
}

/** APK: tocar no lembrete abre as pendências. */
export function initNotificationTaps() {
  if (!isNative()) return;
  void LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
    const url = (notification.extra as { url?: string } | undefined)?.url;
    if (url) window.location.hash = url.replace(/^\/?#?/, "#");
  });
}
