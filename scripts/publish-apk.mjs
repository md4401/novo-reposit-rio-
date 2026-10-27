// Publica um APK novo para os apps instalados se atualizarem: copia para public/download/ninho.apk
// e grava public/download/version.json (versão, build e SHA-256 conferido pelo atualizador do app).
// Uso: node scripts/publish-apk.mjs caminho/do/app-release.apk
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) throw new Error("Informe o caminho do APK assinado");
const gradle = readFileSync("android/app/build.gradle", "utf8");
const build = Number(/versionCode (\d+)/.exec(gradle)[1]);
const name = /versionName "([^"]+)"/.exec(gradle)[1];
copyFileSync(source, "public/download/ninho.apk");
const sha256 = createHash("sha256").update(readFileSync("public/download/ninho.apk")).digest("hex");
// A partir do build 6 a chave de assinatura é nova: quem tem a antiga precisa reinstalar
const version = { name, build, url: "/download/ninho.apk", sha256, ...(build >= 6 ? { reinstallBelow: 6 } : {}) };
writeFileSync("public/download/version.json", `${JSON.stringify(version)}\n`);
console.log(`Publicado ${name} (build ${build}), sha256 ${sha256.slice(0, 12)}…`);
