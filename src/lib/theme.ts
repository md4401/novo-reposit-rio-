// Tema claro/escuro: a escolha fica no aparelho; "sistema" segue o modo do celular/computador.
// O index.html aplica o tema antes de o app carregar (sem piscar branco).
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { isNative } from "./native";

export type ThemePref = "system" | "light" | "dark";
const KEY = "ninho.theme";
const dark = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function resolved(pref: ThemePref) {
  return pref === "system" ? (dark()?.matches ? "dark" : "light") : pref;
}

export function applyTheme(pref = getThemePref()) {
  const theme = resolved(pref);
  const root = document.documentElement;
  // Troca instantânea: sem as animações de cor de botões e cartões no meio do caminho
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b1512" : "#0d2922");
  // Ícones das barras do Android: escuros no tema claro, claros no escuro
  if (isNative()) void SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
  applyTheme(pref);
}

/** Acompanha a troca de modo do sistema enquanto a escolha for "sistema". */
export function watchSystemTheme() {
  dark()?.addEventListener?.("change", () => {
    if (getThemePref() === "system") applyTheme("system");
  });
  applyTheme();
}
