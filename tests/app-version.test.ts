import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O aviso de "nova versão" do APK compara com public/download/version.json
describe("versão do app Android", () => {
  it("version.json nunca anuncia versão maior que a do build.gradle", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    const published = JSON.parse(readFileSync("public/download/version.json", "utf8"));
    const build = Number(/versionCode (\d+)/.exec(gradle)![1]);
    expect(published.build).toBeLessThanOrEqual(build);
    if (published.build === build) expect(published.name).toBe(/versionName "([^"]+)"/.exec(gradle)![1]);
  });

  it("a partir da chave nova (build 6), quem tem a antiga é avisado para reinstalar", () => {
    const published = JSON.parse(readFileSync("public/download/version.json", "utf8"));
    if (published.build >= 6) expect(published.reinstallBelow).toBe(6);
  });

  it("nenhum keystore/certificado versionado", () => {
    const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n");
    expect(tracked.filter((f) => /\.(keystore|jks|p12|pfx|pem|key)$/i.test(f))).toEqual([]);
    expect(readFileSync("android/app/build.gradle", "utf8")).not.toMatch(/(store|key)Password\s+['"]/);
  });
});
