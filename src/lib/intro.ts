// Abertura do app: qual versão mostrar e lembranças entre aberturas (só neste aparelho).
// Completa uma vez por dia; curta nas outras aberturas; esmaecida para quem pede menos movimento.

export type IntroSetting = "full" | "short" | "off";
export type IntroMode = "full" | "short" | "fade";

const SETTING = "ninho.intro";
const DAY = "ninho.intro.day";
const MEMBERS = "ninho.intro.members";
const UI_MODE = "ninho.intro.uiMode";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // modo privado: segue sem lembrar
  }
}

export function introSetting(): IntroSetting {
  const v = read(SETTING);
  return v === "short" || v === "off" ? v : "full";
}
export function setIntroSetting(v: IntroSetting) {
  write(SETTING, v);
}

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function pickIntroMode(): IntroMode {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uiMode = read(UI_MODE);
  const setting = introSetting();
  if (reduced || setting === "off" || uiMode === "simple" || uiMode === "kid") return "fade";
  if (setting === "short" || read(DAY) === localDay()) return "short";
  return "full";
}

export function markIntroShown() {
  write(DAY, localDay());
}

/** Quantas pessoas a família tinha na última vez (um pontinho de luz para cada). */
export function rememberedMembers() {
  const n = Number(read(MEMBERS));
  return Number.isFinite(n) && n >= 1 ? Math.min(6, n) : 3;
}
export function rememberHousehold(members: number, uiMode: string) {
  write(MEMBERS, String(Math.max(1, Math.min(6, members))));
  write(UI_MODE, uiMode);
}

// Depois da abertura, a tela inicial entra com os cartões subindo e o valor do mês contando
let finishedAt = 0;
export function markIntroFinished() {
  finishedAt = Date.now();
  document.body.classList.add("intro-arrive");
  window.setTimeout(() => document.body.classList.remove("intro-arrive"), 1400);
}
export const introJustFinished = () => Date.now() - finishedAt < 1200;
