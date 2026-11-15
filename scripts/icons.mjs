// Gera os ícones do app (PWA e Android) a partir do desenho em SVG. Uso: npm run icons
// Precisa do Playwright (Chromium) instalado na máquina. O desenho não usa fontes.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Mesmo desenho de src/components/Logo.tsx (viewBox 48): três ovos num ninho de galhos, no círculo lima
const LIME = "#d4ff00";
const INK = "#0a0a0a";
function mark(x, y, size) {
  const k = size / 48;
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <circle cx="24" cy="24" r="24" fill="${LIME}"/>
    <ellipse cx="24" cy="20.5" rx="4.6" ry="6" fill="${INK}"/>
    <ellipse cx="16.2" cy="23" rx="3.7" ry="4.8" transform="rotate(-16 16.2 23)" fill="${INK}"/>
    <ellipse cx="31.8" cy="23" rx="3.7" ry="4.8" transform="rotate(16 31.8 23)" fill="${INK}"/>
    <path d="M7.5 25.5 C14 30.5 34 30.5 40.5 25.5" fill="none" stroke="${LIME}" stroke-width="7" stroke-linecap="round"/>
    <g fill="none" stroke="${INK}" stroke-linecap="round">
      <path d="M8.5 26 C14.5 30.5 33.5 30.5 39.5 26" stroke-width="3.6"/>
      <path d="M11 31.6 C17 36 31 36 37 31.6" stroke-width="3.6"/>
      <path d="M15.5 37 C20.5 39.6 27.5 39.6 32.5 37" stroke-width="3.4"/>
    </g>
  </g>`;
}

// mark: tamanho do círculo em relação ao ícone (menor no ícone "maskable" e na camada do Android)
function svg({ mark: fraction = 0.74, background = "#0a0a0a", rounded = false }) {
  const s = 512;
  const m = s * fraction;
  const o = (s - m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="${background}"/>
  ${mark(o, o, m)}
</svg>`;
}

const outputs = [
  { file: "public/icons/icon-512.png", size: 512, opts: {} },
  { file: "public/icons/icon-192.png", size: 192, opts: {} },
  { file: "public/icons/icon-maskable-512.png", size: 512, opts: { mark: 0.56 } },
  { file: "public/icons/apple-touch-icon.png", size: 180, opts: {} },
  // Android (Capacitor): ícone legado e camada da frente do ícone adaptativo
  ...[
    ["mdpi", 48, 108],
    ["hdpi", 72, 162],
    ["xhdpi", 96, 216],
    ["xxhdpi", 144, 324],
    ["xxxhdpi", 192, 432],
  ].flatMap(([density, legacy, fg]) => [
    { file: `android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size: legacy, opts: { rounded: true } },
    { file: `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, size: legacy, opts: { rounded: true } },
    { file: `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, size: fg, opts: { mark: 0.5, background: "transparent" } },
  ]),
];

writeFileSync(resolve(root, "public/icons/favicon.svg"), svg({ rounded: true }));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, opts } of outputs) {
  const target = resolve(root, file);
  if (file.startsWith("android/") && !require("node:fs").existsSync(resolve(root, "android"))) continue;
  mkdirSync(dirname(target), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(opts).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`,
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: target, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("✓", file);
}
await browser.close();
