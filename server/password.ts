// Senha: troca, código de redefinição por e-mail (opcional) ou gerado por quem administra a família.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createSession, hashPassword, rateLimit, sha256, verifyPassword, type SessionUser } from "./auth.js";
import { batch, one, q, query } from "./db.js";
import { emailEnabled, sendEmail } from "./email.js";
import { HttpError } from "./http.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_MINUTES = 30;
const MAX_ATTEMPTS = 5;

function newCode() {
  const chars = Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Gera um código de uso único (os anteriores deixam de valer). */
export async function createResetCode(profileId: string, createdBy: string | null) {
  const code = newCode();
  await batch([
    q(`UPDATE password_resets SET used_at = now() WHERE profile_id = $1 AND used_at IS NULL`, [profileId]),
    q(
      `INSERT INTO password_resets (profile_id, code_hash, created_by, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
      [profileId, sha256(normalizeCode(code)), createdBy, CODE_MINUTES],
    ),
  ]);
  return { code, minutes: CODE_MINUTES };
}

/** "Esqueci a senha": manda o código por e-mail quando o e-mail está configurado.
 *  A resposta é sempre a mesma, exista a conta ou não. */
export async function requestReset(email: string, ip: string) {
  await rateLimit(`forgot-ip:${ip}`, 10, 60);
  await rateLimit(`forgot:${email}`, 3, 60);
  if (!emailEnabled()) return { emailEnabled: false };
  const profile = await one<{ id: string; name: string }>(
    `SELECT id, name FROM profiles WHERE lower(email) = $1 AND NOT is_demo`,
    [email],
  );
  if (profile) {
    const { code } = await createResetCode(profile.id, null);
    await sendEmail(
      email,
      "Código para criar uma nova senha no ninho.",
      `Olá, ${profile.name.split(" ")[0]}!\n\nSeu código é: ${code}\n\nEle vale por ${CODE_MINUTES} minutos e só pode ser usado uma vez.\n` +
        "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.\n\n— ninho.",
    );
  }
  return { emailEnabled: true };
}

/** Usa o código para criar a nova senha; encerra as outras sessões e devolve uma nova. */
export async function resetWithCode(email: string, code: string, password: string, userAgent: string | null) {
  await rateLimit(`reset:${email}`, 10, 15);
  const profile = await one<{ id: string }>(`SELECT id FROM profiles WHERE lower(email) = $1 AND NOT is_demo`, [email]);
  const reset = profile
    ? await one<{ id: string; code_hash: string; attempts: number }>(
        `SELECT id, code_hash, attempts FROM password_resets
          WHERE profile_id = $1 AND used_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1`,
        [profile.id],
      )
    : null;
  const invalid = new HttpError(400, "Código inválido ou vencido. Peça um novo.");
  if (!profile || !reset) throw invalid;
  const expected = Buffer.from(reset.code_hash, "hex");
  const actual = Buffer.from(sha256(normalizeCode(code)), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await query(
      `UPDATE password_resets SET attempts = attempts + 1,
              used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END
        WHERE id = $1`,
      [reset.id, MAX_ATTEMPTS],
    );
    throw invalid;
  }
  await batch([
    q(`UPDATE profiles SET password_hash = $2 WHERE id = $1`, [profile.id, await hashPassword(password)]),
    q(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [reset.id]),
    q(`DELETE FROM sessions WHERE profile_id = $1`, [profile.id]),
  ]);
  return createSession(profile.id, userAgent);
}

/** Troca a senha sabendo a atual; as sessões em outros aparelhos são encerradas. */
export async function changePassword(user: SessionUser, current: string, next: string) {
  await rateLimit(`change-password:${user.id}`, 8, 15);
  const row = await one<{ password_hash: string }>(`SELECT password_hash FROM profiles WHERE id = $1`, [user.id]);
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new HttpError(400, "A senha atual não confere");
  await batch([
    q(`UPDATE profiles SET password_hash = $2 WHERE id = $1`, [user.id, await hashPassword(next)]),
    q(`DELETE FROM sessions WHERE profile_id = $1 AND id <> $2`, [user.id, user.session_id]),
  ]);
}
