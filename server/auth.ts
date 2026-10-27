// Login próprio: senha com scrypt e sessão por token (Bearer) guardada só como hash.
// Funciona igual no navegador, no app instalado (PWA) e no APK Android, sem cookies de terceiros.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { batch, one, q, query } from "./db.js";
import { HttpError } from "./http.js";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 60;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function createSession(profileId: string, userAgent: string | null) {
  const token = `nh_${randomBytes(32).toString("base64url")}`;
  await query(
    `INSERT INTO sessions (profile_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [profileId, sha256(token), userAgent?.slice(0, 200) ?? null, SESSION_DAYS],
  );
  return token;
}

export type SessionUser = {
  id: string;
  household_id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  avatar_color: string;
  timezone: string;
  digest_hour: number;
  session_id: string;
};

export function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function requireUser(request: Request): Promise<SessionUser> {
  const token = bearer(request);
  if (!token) throw new HttpError(401, "Entre na sua conta para continuar");
  const user = await one<SessionUser & { last_seen_at: Date }>(
    `SELECT p.id, p.household_id, p.name, p.email, p.role, p.avatar_color, p.timezone, p.digest_hour,
            s.id AS session_id, s.last_seen_at
       FROM sessions s JOIN profiles p ON p.id = s.profile_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT p.is_demo`,
    [sha256(token)],
  );
  if (!user) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");
  // Renova a sessão (no máximo uma vez por hora)
  if (Date.now() - new Date(user.last_seen_at).getTime() > 3_600_000) {
    await batch([
      q(`UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1`, [user.session_id, SESSION_DAYS]),
      // Última vez que a pessoa usou o app ("e se eu faltar?" usa isso)
      q(`UPDATE profiles SET last_seen_at = now() WHERE id = $1`, [user.id]),
    ]);
  }
  return user;
}

export async function endSession(request: Request) {
  const token = bearer(request);
  if (token) await query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}

/** Limite de tentativas: no máximo `max` em `minutes` minutos por chave. */
export async function rateLimit(key: string, max: number, minutes: number) {
  const row = await one<{ n: number }>(
    `WITH ins AS (INSERT INTO auth_attempts (key) VALUES ($1))
     SELECT count(*)::int AS n FROM auth_attempts WHERE key = $1 AND created_at > now() - make_interval(mins => $2)`,
    [key, minutes],
  );
  if ((row?.n ?? 0) >= max) throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
  // De vez em quando, apaga registros velhos (tentativas e sessões vencidas)
  if (Math.random() < 0.02) {
    await query(`DELETE FROM auth_attempts WHERE created_at < now() - interval '1 day'`);
    await query(`DELETE FROM sessions WHERE expires_at < now()`);
  }
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newInviteCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

export async function audit(profileId: string | null, action: string, entity?: string, entityId?: string, data?: unknown) {
  await query(`INSERT INTO audit_events (profile_id, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5)`, [
    profileId,
    action,
    entity ?? null,
    entityId ?? null,
    data === undefined ? null : JSON.stringify(data),
  ]);
}
