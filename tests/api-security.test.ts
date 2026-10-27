import { beforeAll, describe, expect, it, vi } from "vitest";
import { allowedOrigin, clientIp } from "../server/http";
import { handle } from "../server/routes";

// Testes sem banco: nada aqui toca dados reais.
beforeAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.ALLOWED_ORIGINS;
});

const ID = "00000000-0000-4000-8000-000000000000";
const PROTECTED: [string, string][] = [
  ["GET", "me"], ["PATCH", "me"], ["POST", "household/invite"], ["POST", "demo/clear"], ["POST", "demo/load"],
  ["GET", "overview"], ["GET", "personal"], ["GET", "family"], ["GET", "transactions"], ["POST", "transactions"],
  ["PATCH", `transactions/${ID}`], ["DELETE", `transactions/${ID}`], ["POST", `transactions/${ID}/confirm`],
  ["POST", "accounts"], ["PATCH", `accounts/${ID}`], ["POST", "import"], ["GET", "goals"], ["POST", "goals"],
  ["POST", `goals/${ID}/contributions`], ["DELETE", `goals/${ID}`], ["GET", "alerts"], ["POST", "alerts/dismiss"],
  ["GET", "health"], ["GET", "rules"], ["PATCH", `rules/${ID}`], ["DELETE", `rules/${ID}`], ["GET", "nia"],
  ["POST", "nia"], ["POST", "nia/clear"], ["POST", "nia/transcribe"], ["POST", "nia/receipt"],
];

const call = (method: string, path: string, init: RequestInit = {}) =>
  handle(new Request(`https://ninho.test/api/${path}`, { method, ...init, body: method === "GET" ? undefined : (init.body ?? "{}") }));

describe("API: autenticação obrigatória", () => {
  it.each(PROTECTED)("%s /api/%s sem token → 401", async (method, path) => {
    const res = await call(method, path);
    expect(res.status).toBe(401);
  });

  it("token inválido também é recusado antes de qualquer dado", async () => {
    const res = await call("GET", "me", { headers: { authorization: "Bearer " } });
    expect(res.status).toBe(401);
  });
});

describe("API: cabeçalhos", () => {
  it("respostas privadas não vão para cache", async () => {
    const res = await call("GET", "me");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("CORS fechado para origens desconhecidas", async () => {
    const res = await call("GET", "me", { headers: { origin: "https://site-malicioso.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await handle(new Request("https://ninho.test/api/me", { method: "OPTIONS", headers: { origin: "https://site-malicioso.example" } }));
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("CORS só para origens configuradas", () => {
    expect(allowedOrigin("https://app.example", "https://app.example, https://outro.example/")).toBe("https://app.example");
    expect(allowedOrigin("https://outro.example", "https://app.example, https://outro.example/")).toBe("https://outro.example");
    expect(allowedOrigin("https://evil.example", "https://app.example")).toBeNull();
    expect(allowedOrigin("https://app.example", "")).toBeNull();
  });

  it("IP do cliente vem do cabeçalho da plataforma", () => {
    const req = new Request("https://x", { headers: { "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" } });
    expect(clientIp(req)).toBe("1.1.1.1");
  });
});

describe("API: erros internos", () => {
  it("não expõem detalhes nem configuração", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call("POST", "auth/login", { body: JSON.stringify({ email: "a@b.co", password: "segredo-123" }) });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toMatch(/DATABASE_URL|stack|at /);
    expect(spy.mock.calls.flat().join(" ")).not.toContain("segredo-123");
    spy.mockRestore();
  });
});
