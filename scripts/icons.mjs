// Gera os ícones do app (PWA e Android) a partir do desenho em SVG. Uso: npm run icons
// Precisa do Playwright (Chromium) instalado na máquina.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const font = pathToFileURL(resolve(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).href;

// mark: tamanho do quadrado verde-limão em relação ao ícone (menor no ícone "maskable")
function svg({ mark = 0.62, background = "#0d2922", rounded = false }) {
  const s = 512;
  const m = s * mark;
  const o = (s - m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><style>@font-face{font-family:Inter;src:url(${font})}</style></defs>
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="${background}"/>
  <circle cx="${s * 0.86}" cy="${s * 0.12}" r="${s * 0.34}" fill="none" stroke="#2e5546" stroke-width="3"/>
  <circle cx="${s * 0.86}" cy="${s * 0.12}" r="${s * 0.48}" fill="none" stroke="#24493c" stroke-width="3"/>
  <rect x="${o}" y="${o}" width="${m}" height="${m}" rx="${m * 0.27}" fill="#c7f46c"/>
  <text x="${s / 2 - m * 0.04}" y="${s / 2 + m * 0.2}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="${m * 0.62}" fill="#0d2922">n</text>
  <circle cx="${s / 2 + m * 0.25}" cy="${s / 2 + m * 0.17}" r="${m * 0.055}" fill="#0d2922"/>
</svg>`;
}

const outputs = [
  { file: "public/icons/icon-512.png", size: 512, opts: {} },
  { file: "public/icons/icon-192.png", size: 192, opts: {} },
  { file: "public/icons/icon-maskable-512.png", size: 512, opts: { mark: 0.5 } },
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
    { file: `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, size: fg, opts: { mark: 0.42, background: "transparent" } },
  ]),
];

writeFileSync(resolve(root, "public/icons/favicon.svg"), svg({ rounded: true }).replace(/<defs>.*<\/defs>/s, ""));
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
