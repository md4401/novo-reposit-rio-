// Integração com o app Android (Capacitor). No navegador nada aqui é executado.
import { App } from "@capacitor/app";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { notifyChange } from "./api";
import { navigate } from "./router";

type Cap = { isNativePlatform?: () => boolean };

export function isNative() {
  return Boolean((window as unknown as { Capacitor?: Cap }).Capacitor?.isNativePlatform?.());
}

export type AppVersion = { name: string; build: number };
/** reinstallBelow: builds abaixo deste número usam a assinatura antiga (comprometida) e não
 *  conseguem atualizar por cima — é preciso desinstalar e instalar de novo. */
export type PublishedVersion = AppVersion & { reinstallBelow?: number; url?: string; sha256?: string };
export type UpdateInfo = { current: AppVersion; latest: PublishedVersion | null; reinstall: boolean };

// Atualizador nativo (APK 0.4.0 em diante): baixa, confere hash e assinatura e abre o instalador
type ApkUpdater = {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string; sha256: string }): Promise<void>;
  addListener(event: "progress", fn: (e: { percent: number }) => void): Promise<PluginListenerHandle>;
};
const Updater = registerPlugin<ApkUpdater>("ApkUpdater");

/** O APK instalado tem o atualizador? (versões antigas só baixam pelo navegador) */
export async function hasNativeUpdater() {
  if (!isNative()) return false;
  try {
    await Updater.canInstall();
    return true;
  } catch {
    return false;
  }
}

/** Baixa e abre o instalador. Devolve "settings" se o Android pedir para liberar a instalação. */
export async function installUpdate(latest: PublishedVersion, onProgress: (percent: number) => void): Promise<"started" | "settings"> {
  if (!latest.sha256) throw new Error("Versão sem verificação publicada");
  const { allowed } = await Updater.canInstall();
  if (!allowed) {
    await Updater.openInstallSettings();
    return "settings";
  }
  const listener = await Updater.addListener("progress", (e) => onProgress(e.percent));
  try {
    await Updater.downloadAndInstall({ url: new URL(latest.url ?? "/download/ninho.apk", window.location.origin).href, sha256: latest.sha256 });
  } finally {
    await listener.remove();
  }
  return "started";
}

// ---------------------------------------------------------------------------
// Site novo publicado: o APK (e o app instalado pelo navegador) recarregam sozinhos

const currentBuild = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src") ?? null;

async function newerSiteAvailable() {
  const mine = currentBuild();
  if (!mine) return false; // ambiente de desenvolvimento
  try {
    const html = await (await fetch(`/?v=${Date.now()}`, { cache: "no-store" })).text();
    const published = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/.exec(html)?.[1];
    return Boolean(published && published !== mine);
  } catch {
    return false;
  }
}

/** Ao voltar para o app, se houver versão nova do site e nada estiver aberto, recarrega. */
export function watchSiteUpdates() {
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== "visible") return;
    checking = true;
    try {
      const busy = document.querySelector(".modal-overlay, .modal") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "");
      if (!busy && (await newerSiteAvailable())) window.location.reload();
    } finally {
      checking = false;
    }
  };
  document.addEventListener("visibilitychange", () => void check());
  window.setInterval(() => void check(), 30 * 60 * 1000);
}

let cached: Promise<UpdateInfo | null> | null = null;

/** Versão instalada e a última publicada em /download/version.json. */
export function checkUpdate(force = false): Promise<UpdateInfo | null> {
  if (!isNative()) return Promise.resolve(null);
  if (!cached || force) {
    cached = (async () => {
      // Versões até a 0.2.x não têm o plugin App: são as mais antigas
      const info = await App.getInfo().catch(() => null);
      const current = info ? { name: info.version, build: Number(info.build) } : { name: "antiga", build: 0 };
      try {
        const res = await fetch(`/download/version.json?t=${Date.now()}`, { cache: "no-store" });
        const published = (await res.json()) as PublishedVersion;
        const latest = published.build > current.build ? published : null;
        return { current, latest, reinstall: Boolean(latest && current.build < (published.reinstallBelow ?? 0)) };
      } catch {
        return { current, latest: null, reinstall: false };
      }
    })().catch(() => null);
  }
  return cached;
}

export function initNative() {
  if (!isNative()) return;
  // Voltar do Android: fecha janela/volta tela; na tela inicial, minimiza em vez de fechar.
  void App.addListener("backButton", ({ canGoBack }) => {
    const page = window.location.hash.replace(/^#\/?/, "").split("?")[0] || "inicio";
    if (canGoBack) window.history.back();
    else if (page !== "inicio") navigate("inicio");
    else void App.minimizeApp();
  });
  // Ao voltar para o app, atualiza os números (podem ter mudado em outro aparelho).
  let hiddenAt = 0;
  void App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) notifyChange();
  });
}
