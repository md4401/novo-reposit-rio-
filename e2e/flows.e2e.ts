// Fluxos principais, no celular e no computador: cadastro com o guia, lançar despesa,
// revisar compras e importar extrato. A API é a de mentira (fake-api.ts).
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { FakeApi } from "./fake-api";

const mobile = (info: TestInfo) => info.project.name === "celular";

/** Botão "Adicionar": "+" da barra de baixo no celular, botão do menu lateral no computador. */
async function openAdd(page: Page, info: TestInfo) {
  await page.locator(mobile(info) ? ".bottom-add" : ".sidebar-add").click();
  await expect(page.getByRole("heading", { name: "Adicionar" })).toBeVisible();
}

let api: FakeApi;
test.afterEach(() => {
  expect(api.unhandled, "chamadas que a API de teste não simula").toEqual([]);
});

test("cadastro: boas-vindas e primeiro passo do guia", async ({ page }) => {
  api = new FakeApi();
  await api.install(page);
  await page.goto("/");

  await page.getByLabel("Seu nome").fill("Ana Ribeiro");
  await page.getByLabel("E-mail").fill("ana@exemplo.com");
  await page.getByLabel("Senha").fill("senha-segura-123");
  await page.getByText("Começar com dados de exemplo").click(); // desmarca
  await page.getByRole("button", { name: "Criar conta" }).click();

  // Boas-vindas: 3 telas, só na primeira vez
  await expect(page.getByRole("heading", { name: /Oi, Ana!/ })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByRole("heading", { name: "A família vê só os totais" })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByRole("heading", { name: "Quatro jeitos de registrar" })).toBeVisible();
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page.locator(".welcome")).toHaveCount(0);

  // Guia: cadastrar a primeira conta
  const guide = page.getByRole("region", { name: "Primeiros passos" });
  await expect(guide.getByText("0 de 5 concluídos")).toBeVisible();
  await guide.getByRole("button", { name: /Cadastre sua conta ou cartão/ }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Nubank");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar" }).click();
  await expect(guide.getByText("1 de 5 concluídos")).toBeVisible();
  expect(api.callsTo("POST", /^accounts$/)).toHaveLength(1);

  // Recarregar não mostra as boas-vindas de novo
  await page.reload();
  await expect(guide.getByText("1 de 5 concluídos")).toBeVisible();
  await expect(page.locator(".welcome")).toHaveCount(0);
});

test("lançar despesa: categoria e Pessoal/Família em botões", async ({ page }, info) => {
  api = new FakeApi({ signedIn: true, accounts: [{ name: "Nubank" }] });
  await api.install(page);
  await page.goto("/");

  await openAdd(page, info);
  await page.getByRole("button", { name: /^Despesa/ }).click();
  await page.getByLabel("Estabelecimento ou descrição").fill("Padaria da Vila");
  await page.getByLabel("Valor em reais").fill("12,50");
  await page.getByRole("radio", { name: "Alimentação" }).click();
  await page.getByRole("radio", { name: "Família" }).click();
  await page.getByRole("button", { name: "Registrar" }).click();

  await expect(page.locator(".toast")).toContainText("Despesa registrada: Alimentação.");
  const [call] = api.callsTo("POST", /^transactions$/);
  expect(call.body).toMatchObject({
    description: "Padaria da Vila",
    amountCents: 1250,
    direction: "expense",
    allocations: [{ categoryId: "alimentacao", amountCents: 1250, scope: "family" }],
  });
});

test("revisar 5 compras: uma por vez, sem abrir outra janela", async ({ page }) => {
  api = new FakeApi({
    signedIn: true,
    accounts: [{ name: "Nubank", kind: "credit_card" }],
    pending: [
      { description: "Mercado Bom Preço", amountCents: 23000 },
      { description: "Posto Shell", amountCents: 18000 },
      { description: "Farmácia Saúde", amountCents: 4590 },
      { description: "Cinema Center", amountCents: 6400 },
      { description: "Loja Central", amountCents: 18750 },
    ],
  });
  await api.install(page);
  // Atalho do app instalado: abre direto o "Revisar compras"
  await page.goto("/?abrir=resumo");

  const dialog = page.getByRole("dialog");
  const choices = ["Alimentação", "Transporte", "Saúde", "Lazer", "Compras"];
  for (const [i, name] of choices.entries()) {
    await expect(dialog.getByText(`${i + 1} de 5 ·`)).toBeVisible();
    await dialog.getByRole("radio", { name }).click();
    await dialog.getByRole("button", { name: "Confirmar" }).click();
  }
  await expect(dialog.getByRole("heading", { name: "Tudo em dia" })).toBeVisible();
  await expect(dialog.getByText("5 compras revisadas")).toBeVisible();
  // Uma janela só o tempo todo
  await expect(page.locator(".modal")).toHaveCount(1);

  const patches = api.callsTo("PATCH", /^transactions\//);
  expect(patches).toHaveLength(5);
  expect(patches.map((c) => (c.body as { allocations: { categoryId: string }[] }).allocations[0].categoryId)).toEqual([
    "alimentacao",
    "transporte",
    "saude",
    "lazer",
    "compras",
  ]);
});

test("importar extrato CSV: prévia e importação", async ({ page }) => {
  api = new FakeApi({ signedIn: true, accounts: [{ name: "Conta do Itaú" }] });
  await api.install(page);
  await page.goto("/#/transacoes");

  await page.getByRole("button", { name: "Importar extrato" }).first().click();
  await expect(page.getByRole("heading", { name: "Importar extrato" })).toBeVisible();
  const csv = ["data;descricao;valor", "20/10/2026;Mercado Bom Preço;-230,00", "21/10/2026;Salário;4200,00", "22/10/2026;Padaria da Vila;-12,50"].join("\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  await expect(page.getByText(/3\s*novas/)).toBeVisible();
  await page.getByRole("button", { name: "Importar 3 movimentações" }).click();

  await expect(page.locator(".toast")).toContainText("3 movimentações importadas");
  await expect(page).toHaveURL(/#\/transacoes/);
  await expect(page.getByText("Mercado Bom Preço")).toBeVisible();
  expect(api.callsTo("POST", /^import$/).map((c) => (c.body as { commit: boolean }).commit)).toEqual([false, true]);
});
