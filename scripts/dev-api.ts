// Servidor local da API (o Vite encaminha /api para cá). Uso: npm run dev:api
import { createServer } from "node:http";
import { handle } from "../server/routes.js";

const port = Number(process.env.API_PORT ?? 8787);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? `localhost:${port}`;
  const request = new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const started = Date.now();
  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  console.log(`${req.method} ${req.url} → ${response.status} (${Date.now() - started}ms)`);
}).listen(port, () => console.log(`API em http://localhost:${port}`));
