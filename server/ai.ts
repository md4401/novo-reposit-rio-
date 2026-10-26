// IA opcional, em qualquer API compatível com a da OpenAI. O provedor é reconhecido
// pela chave: Groq (gsk_…, tem plano grátis), Gemini (AIza…) ou OpenAI (sk-…).
// Sem AI_API_KEY o app continua funcionando: a Nia usa regras locais.
// A IA só recebe números já calculados pelo banco e nunca grava nada sozinha.
import { CATEGORIES } from "../shared/categories.js";

type Provider = { base: string; model: string; transcribeModel: string | null };

const PROVIDERS: Record<string, Provider> = {
  // qwen3.8-27b: bom português, JSON e lê imagens (nota fiscal). Whisper: mensagens de voz.
  groq: { base: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", transcribeModel: "whisper-large-v3-turbo" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", transcribeModel: null },
  openai: { base: "https://api.openai.com/v1", model: "gpt-5-mini", transcribeModel: "whisper-1" },
};

export function aiEnabled() {
  return Boolean(process.env.AI_API_KEY);
}

export function aiConfig() {
  const key = process.env.AI_API_KEY ?? "";
  const custom = process.env.AI_BASE_URL;
  const provider = key.startsWith("gsk_")
    ? PROVIDERS.groq
    : key.startsWith("AIza")
      ? PROVIDERS.gemini
      : custom?.includes("groq.com")
        ? PROVIDERS.groq
        : PROVIDERS.openai;
  return {
    key,
    base: (custom || provider.base).replace(/\/$/, ""),
    model: process.env.AI_MODEL || provider.model,
    visionModel: process.env.AI_VISION_MODEL || process.env.AI_MODEL || provider.model,
    transcribeModel: process.env.AI_TRANSCRIBE_MODEL || provider.transcribeModel,
  };
}

/** Mensagens de voz precisam de um provedor com transcrição (Groq ou OpenAI). */
export function transcriptionEnabled() {
  return aiEnabled() && Boolean(aiConfig().transcribeModel);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | unknown[] };

async function chat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; vision?: boolean } = {}) {
  const { key, base, model, visionModel } = aiConfig();
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.vision ? visionModel : model,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      max_completion_tokens: opts.maxTokens ?? 800,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`IA respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "") // modelos que "pensam em voz alta"
    .replace(/[\u202f\u00a0]/g, " ")
    .trim();
}

/** Transcreve um áudio curto (pt-BR). O áudio não é guardado em lugar nenhum. */
export async function transcribe(audio: Blob, fileName: string) {
  const { key, base, transcribeModel } = aiConfig();
  if (!transcribeModel) throw new Error("Provedor de IA sem transcrição de áudio");
  const form = new FormData();
  form.append("file", audio, fileName);
  form.append("model", transcribeModel);
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("prompt", "Compras, gastos e finanças da família em reais: mercado, farmácia, limpeza, Pix, cartão.");
  const response = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Transcrição respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { text?: string };
  return (data.text ?? "").trim();
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

/** Classifica vários estabelecimentos numa chamada só (importação de extrato). */
export async function classifyManyWithAi(descriptions: string[]) {
  const result = new Map<string, { categoryId: string; confidence: number }>();
  if (descriptions.length === 0) return result;
  const content = await chat(
    [
      {
        role: "system",
        content:
          `Classifique cada despesa de extrato bancário brasileiro em uma categoria. ` +
          `Responda JSON {"items": [{"i": número da linha, "categoryId": string, "confidence": número de 0 a 1}]}. ` +
          `Categorias válidas: ${expenseIds.join(", ")}. Se não souber, use confidence baixo.`,
      },
      { role: "user", content: descriptions.map((d, i) => `${i}: ${d.slice(0, 120)}`).join("\n") },
    ],
    { json: true, maxTokens: 60 * descriptions.length + 200 },
  );
  const parsed = JSON.parse(content) as { items?: { i: number; categoryId: string; confidence: number }[] };
  for (const item of parsed.items ?? []) {
    const description = descriptions[item.i];
    if (description && expenseIds.includes(item.categoryId)) {
      result.set(description, { categoryId: item.categoryId, confidence: Number(item.confidence) || 0 });
    }
  }
  return result;
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
    { json: true, maxTokens: 1500, vision: true },
  );
  return JSON.parse(content) as {
    merchant: string | null;
    date: string | null;
    totalCents: number;
    items: { name: string; amountCents: number; categoryId: string }[];
  };
}
