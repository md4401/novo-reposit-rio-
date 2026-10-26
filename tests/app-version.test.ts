import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O aviso de "nova versão" do APK compara com public/download/version.json
describe("versão do app Android", () => {
  it("version.json acompanha o build.gradle", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    const published = JSON.parse(readFileSync("public/download/version.json", "utf8"));
    expect(published.build).toBe(Number(/versionCode (\d+)/.exec(gradle)![1]));
    expect(published.name).toBe(/versionName "([^"]+)"/.exec(gradle)![1]);
  });
});
