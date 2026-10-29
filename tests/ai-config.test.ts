import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig, aiEnabled, classifyManyWithAi, parseAiJson, transcriptionEnabled } from "../server/ai";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe("provedor de IA pela chave", () => {
  it("sem chave: Nia por regras", () => {
    delete process.env.AI_API_KEY;
    expect(aiEnabled()).toBe(false);
    expect(transcriptionEnabled()).toBe(false);
  });

  it("chave da Groq liga texto, imagem e voz sem outra configuração", () => {
    process.env.AI_API_KEY = "gsk_teste";
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
    expect(aiConfig()).toMatchObject({
      base: "https://api.groq.com/openai/v1",
      model: "qwen/qwen3.8-27b",
      visionModel: "qwen/qwen3.8-27b",
      transcribeModel: "whisper-large-v3-turbo",
    });
    expect(transcriptionEnabled()).toBe(true);
  });

  it("Gemini não tem voz; variáveis explícitas têm prioridade", () => {
    process.env.AI_API_KEY = "AIza-teste";
    expect(aiConfig().transcribeModel).toBeNull();
    process.env.AI_MODEL = "outro-modelo";
    expect(aiConfig().model).toBe("outro-modelo");
  });
});

describe("resposta da IA em JSON", () => {
  it("aceita texto, bloco ```json ou pensamento cortado em volta", () => {
    expect(parseAiJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseAiJson('Claro! {"items": []} pronto')).toEqual({ items: [] });
    expect(() => parseAiJson("não sei")).toThrow();
  });

  it("modelo que pensa quebra o modo JSON (json_validate_failed): pede de novo sem ele", async () => {
    process.env.AI_API_KEY = "gsk_teste";
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        if (bodies.length === 1)
          return new Response(JSON.stringify({ error: { code: "json_validate_failed", message: "Failed to generate JSON" } }), { status: 400 });
        const content = '<think>mercado é comida</think>{"items": [{"i": 0, "categoryId": "alimentacao", "confidence": 0.9}]}';
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }),
    );
    const result = await classifyManyWithAi(["SUPERMERCADO BOM PRECO"]);
    expect(result.get("SUPERMERCADO BOM PRECO")).toEqual({ categoryId: "alimentacao", confidence: 0.9 });
    expect(bodies[0].response_format).toBeDefined();
    expect(bodies[1].response_format).toBeUndefined();
  });
});
