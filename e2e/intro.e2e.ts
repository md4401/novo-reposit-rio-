// Abertura cinematográfica: o ninho se forma, o logo voa até o topo e a tela inicial aparece.
// Fotografa a cena em vários momentos (pasta test-results) e confere duração, pular e menos movimento.
import { expect, test } from "@playwright/test";
import { FakeApi } from "./fake-api";

let api: FakeApi;
test.afterEach(() => {
  expect(api.unhandled, "chamadas que a API de teste não simula").toEqual([]);
});

test("completa: ninho, logo voando até o topo e tela inicial", async ({ page }, info) => {
  api = new FakeApi({ signedIn: true, intro: "full" });
  await api.install(page);
  await page.goto("/");
  await expect(page.locator(".intro.intro-full")).toBeVisible();
  // A cena conta a partir de quando aparece (o servidor de desenvolvimento demora para carregar)
  const start = Date.now();
  for (const ms of [150, 650, 1100, 1500, 1900, 2250, 2400, 2550]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - start)));
    await page.screenshot({ path: info.outputPath(`abertura-${String(ms).padStart(4, "0")}ms.png`) });
  }
  // Some em menos de 3,5 s e deixa a tela inicial com o logo no lugar
  await expect(page.locator(".intro")).toHaveCount(0, { timeout: 3500 - (Date.now() - start) });
  expect(Date.now() - start).toBeLessThan(3600);
  await expect(page.locator("#boot")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("abertura-fim.png") });
  // Na mesma data, a próxima abertura é a curta
  await page.reload();
  await expect(page.locator(".intro.intro-short")).toBeVisible();
  await expect(page.locator(".intro")).toHaveCount(0, { timeout: 1600 });
});

test("toque para pular", async ({ page }) => {
  api = new FakeApi({ signedIn: true, intro: "full" });
  await api.install(page);
  await page.goto("/");
  await page.locator(".intro").click({ position: { x: 40, y: 40 } });
  await expect(page.locator(".intro")).toHaveCount(0, { timeout: 1200 });
});

test("menos movimento: só esmaece", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  api = new FakeApi({ signedIn: true, intro: "full" });
  await api.install(page);
  await page.goto("/");
  await expect(page.locator(".intro.intro-fade")).toBeVisible();
  await expect(page.locator(".intro")).toHaveCount(0, { timeout: 1000 });
});

test("sem conta: termina na tela de entrar", async ({ page }) => {
  api = new FakeApi({ intro: "full" });
  await api.install(page);
  await page.goto("/");
  await expect(page.locator(".intro")).toHaveCount(0, { timeout: 3500 });
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
});
