// Menu enxuto: telas de pouco uso saíram das abas, mas os endereços antigos continuam abrindo.
import { expect, test } from "@playwright/test";
import { FakeApi } from "./fake-api";

let api: FakeApi;
test.afterEach(() => {
  expect(api.unhandled, "chamadas que a API de teste não simula").toEqual([]);
});

test("menu sem Etiquetas, Desafios, Desejos, Reunião, Bancos e Pontos", async ({ page }, info) => {
  api = new FakeApi({ signedIn: true, welcomeSeen: true });
  await api.install(page);
  await page.goto("/");
  if (info.project.name === "celular") {
    await page.getByRole("button", { name: "Menu e configurações" }).click();
    await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  }
  const menu = page.locator(info.project.name === "celular" ? ".sheet-sections" : ".sidebar");
  await expect(menu.getByRole("button", { name: "Patrimônio e dívidas", exact: true })).toBeVisible();
  for (const gone of ["Etiquetas", "Desafios", "Desejos", "Reunião do mês", "Custo dos bancos", "Benefícios e pontos", "Recebidos", "Acompanhar"]) {
    await expect(menu.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
  }
  // Fora de fevereiro a maio, o IR não é aba; renda fixa não vê Renda variável
  await expect(menu.getByRole("button", { name: "Imposto de Renda", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Renda variável", exact: true })).toHaveCount(0);
});
