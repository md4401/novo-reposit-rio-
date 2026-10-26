// IA opcional (OpenAI ou qualquer API compatível, como o Gemini do Google).
// Sem AI_API_KEY o app continua funcionando: a Nia usa regras locais.
// A IA só recebe números já calculados pelo banco e nunca grava nada sozinha.
import { CATEGORIES } from "../shared/categories.js";

const DEFAULT_BASE = "https://api.openai.com/v1";

export function aiEnabled() {
  return Boolean(process.env.AI_API_KEY);
}

function config() {
  return {
    key: process.env.AI_API_KEY ?? "",
    base: (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gpt-5-mini",
  };
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | unknown[] };

async function chat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}) {
  const { key, base, model } = config();
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      max_completion_tokens: opts.maxTokens ?? 800,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`IA respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

const expenseIds = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.id);

export async function classifyWithAi(description: string) {
  const content = await chat(
    [
      {
        role: "system",
        content:
          `Classifique a despesa de um extrato bancário brasileiro em uma categoria. ` +
          `Responda JSON {"categoryId": string, "confidence": number entre 0 e 1}. ` +
          `Categorias válidas: ${expenseIds.join(", ")}. Se não souber, use confidence baixo.`,
      },
      { role: "user", content: description.slice(0, 200) },
    ],
    { json: true, maxTokens: 100 },
  );
  const parsed = JSON.parse(content) as { categoryId?: string; confidence?: number };
  if (!parsed.categoryId || !expenseIds.includes(parsed.categoryId)) return null;
  return { categoryId: parsed.categoryId, confidence: Number(parsed.confidence ?? 0) };
}

/** Resposta livre da Nia a partir de um contexto já calculado (só dados da própria pessoa). */
export async function niaAnswer(question: string, context: unknown, history: { role: "user" | "assistant"; content: string }[]) {
  return chat(
    [
      {
        role: "system",
        content:
          "Você é a Nia, assistente financeira do app ninho., em português do Brasil. Seja breve (até 5 frases), " +
          "acolhedora e prática. Use SOMENTE os números do contexto JSON (valores em centavos; mostre em reais, " +
          "formato R$ 1.234,56). Nunca invente valores, nunca prometa ações bancárias (Pix, pagamentos) e não fale " +
          "de dados de outras pessoas da família além dos totais familiares do contexto. Se faltar dado, diga isso.\n" +
          `Contexto: ${JSON.stringify(context)}`,
      },
      ...history.slice(-6),
      { role: "user", content: question.slice(0, 1000) },
    ],
    { maxTokens: 500 },
  );
}

/** Leitura de nota fiscal por imagem (modelo com visão). */
export async function readReceiptWithAi(imageDataUrl: string) {
  const content = await chat(
    [
      {
        role: "system",
        content:
          "Leia a nota fiscal/cupom brasileiro da imagem. Responda JSON " +
          '{"merchant": string|null, "date": "AAAA-MM-DD"|null, "totalCents": inteiro, ' +
          '"items": [{"name": string, "amountCents": inteiro, "categoryId": string}]}. ' +
          `categoryId deve ser um de: ${expenseIds.join(", ")}. Valores em centavos. ` +
          "Inclua só itens legíveis; não invente produtos. Se não conseguir ler, items vazio e totalCents 0.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Leia esta nota." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    { json: true, maxTokens: 1500 },
  );
  return JSON.parse(content) as {
    merchant: string | null;
    date: string | null;
    totalCents: number;
    items: { name: string; amountCents: number; categoryId: string }[];
  };
}
