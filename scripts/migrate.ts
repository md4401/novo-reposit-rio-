// Aplica db/migrations/*.sql em ordem (cada arquivo uma vez) e atualiza o catálogo de categorias.
// Uso: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { Client, neonConfig } from "@neondatabase/serverless";
import { CATEGORIES } from "../shared/categories.js";

neonConfig.webSocketConstructor = WebSocket;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL (veja .env.example)");

const client = new Client(url);
await client.connect();
await client.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
);
const applied = new Set((await client.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name as string));
const dir = new URL("../db/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const text = readFileSync(new URL(file, dir), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(text);
    await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    await client.query("COMMIT");
    console.log(`✓ ${file}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`✗ ${file}`);
    throw error;
  }
}

for (const [i, c] of CATEGORIES.entries()) {
  await client.query(
    `INSERT INTO categories (id, name, icon, color, kind, sort) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET name = $2, icon = $3, color = $4, kind = $5, sort = $6`,
    [c.id, c.name, c.icon, c.color, c.kind, i],
  );
}
console.log(`Banco atualizado (${files.length} migrations, ${CATEGORIES.length} categorias).`);
await client.end();
