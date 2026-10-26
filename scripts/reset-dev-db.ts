// SÓ PARA DESENVOLVIMENTO: apaga todas as tabelas do banco de DATABASE_URL.
// Exige confirmação explícita: CONFIRM_RESET=apagar-tudo npm run db:reset
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = WebSocket;
if (process.env.CONFIRM_RESET !== "apagar-tudo") {
  console.error("Isto apaga TODOS os dados. Rode com CONFIRM_RESET=apagar-tudo para confirmar.");
  process.exit(1);
}
const client = new Client(process.env.DATABASE_URL!);
await client.connect();
await client.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`);
console.log("Banco zerado. Rode npm run db:migrate.");
await client.end();
