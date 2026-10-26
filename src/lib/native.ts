// Integração com o app Android (Capacitor). No navegador nada aqui é executado.
import { App } from "@capacitor/app";
import { notifyChange } from "./api";
import { navigate } from "./router";

type Cap = { isNativePlatform?: () => boolean };

export function isNative() {
  return Boolean((window as unknown as { Capacitor?: Cap }).Capacitor?.isNativePlatform?.());
}

export type AppVersion = { name: string; build: number };
export type UpdateInfo = { current: AppVersion; latest: AppVersion | null };

let cached: Promise<UpdateInfo | null> | null = null;

/** Versão instalada e a última publicada em /download/version.json. */
export function checkUpdate(force = false): Promise<UpdateInfo | null> {
  if (!isNative()) return Promise.resolve(null);
  if (!cached || force) {
    cached = (async () => {
      const info = await App.getInfo();
      const current = { name: info.version, build: Number(info.build) };
      try {
        const res = await fetch(`/download/version.json?t=${Date.now()}`, { cache: "no-store" });
        const latest = (await res.json()) as AppVersion;
        return { current, latest: latest.build > current.build ? latest : null };
      } catch {
        return { current, latest: null };
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
