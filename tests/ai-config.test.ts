import { afterEach, describe, expect, it } from "vitest";
import { aiConfig, aiEnabled, transcriptionEnabled } from "../server/ai";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
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
