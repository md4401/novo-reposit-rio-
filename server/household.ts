// Família: papéis, remover integrante, sair da família e apagar a conta (LGPD).
// Quem sai leva os próprios dados para uma família nova só sua; nada pessoal fica para trás.
import { audit, newInviteCode, verifyPassword, type SessionUser } from "./auth.js";
import { batch, one, q, query } from "./db.js";
import { HttpError } from "./http.js";

type Member = { id: string; name: string; role: "admin" | "member"; is_demo: boolean };

async function member(user: SessionUser, memberId: string) {
  const m = await one<Member>(`SELECT id, name, role, is_demo FROM profiles WHERE id = $1 AND household_id = $2`, [
    memberId,
    user.household_id,
  ]);
  if (!m) throw new HttpError(404, "Integrante não encontrado");
  return m;
}

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") throw new HttpError(403, "Só quem administra a família pode fazer isso");
}

/** Antes de alguém sair: garante outro administrador e passa as metas da família que essa pessoa criou. */
async function handOver(householdId: string, leavingId: string) {
  const others = await query<{ id: string; role: string }>(
    `SELECT id, role FROM profiles WHERE household_id = $1 AND id <> $2 AND NOT is_demo ORDER BY created_at, id`,
    [householdId, leavingId],
  );
  if (!others.length) return null;
  const admin = others.find((o) => o.role === "admin") ?? others[0];
  await batch([
    q(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [admin.id]),
    q(`UPDATE financial_goals SET owner_id = $1 WHERE household_id = $2 AND owner_id = $3 AND scope = 'family'`, [
      admin.id,
      householdId,
      leavingId,
    ]),
  ]);
  return admin.id;
}

/** Leva a pessoa (e o que é só dela) para uma família nova. */
async function moveToNewHousehold(profileId: string, name: string) {
  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    created = await one<{ id: string }>(
      `INSERT INTO households (name, invite_code) VALUES ($1, $2) ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
      [`Família de ${name.split(" ")[0]}`, newInviteCode()],
    );
  }
  if (!created) throw new HttpError(500, "Não foi possível criar a nova família. Tente de novo.");
  await batch([
    q(`UPDATE profiles SET household_id = $2, role = 'admin' WHERE id = $1`, [profileId, created.id]),
    q(`UPDATE financial_goals SET household_id = $2 WHERE owner_id = $1 AND scope = 'personal'`, [profileId, created.id]),
    q(`UPDATE budgets SET household_id = $2 WHERE owner_id = $1 AND scope = 'personal'`, [profileId, created.id]),
  ]);
}

export async function setRole(user: SessionUser, memberId: string, role: "admin" | "member") {
  requireAdmin(user);
  const m = await member(user, memberId);
  if (m.is_demo) throw new HttpError(400, "Integrantes de exemplo não têm papel");
  if (role === "member") {
    const admins = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM profiles WHERE household_id = $1 AND role = 'admin' AND NOT is_demo AND id <> $2`,
      [user.household_id, memberId],
    );
    if (!admins?.n) throw new HttpError(400, "A família precisa de pelo menos uma pessoa administradora");
  }
  await query(`UPDATE profiles SET role = $2 WHERE id = $1`, [memberId, role]);
  await audit(user.id, "household.role", "profile", memberId, { role });
}

export async function removeMember(user: SessionUser, memberId: string) {
  requireAdmin(user);
  if (memberId === user.id) throw new HttpError(400, "Para sair da família, use “Sair da família”");
  const m = await member(user, memberId);
  if (m.is_demo) {
    await query(`DELETE FROM profiles WHERE id = $1 AND is_demo`, [memberId]);
  } else {
    await query(`UPDATE financial_goals SET owner_id = $1 WHERE household_id = $2 AND owner_id = $3 AND scope = 'family'`, [
      user.id,
      user.household_id,
      memberId,
    ]);
    await moveToNewHousehold(memberId, m.name);
  }
  await audit(user.id, "household.removed", "profile", memberId);
}

export async function leaveHousehold(user: SessionUser) {
  const next = await handOver(user.household_id, user.id);
  if (!next) throw new HttpError(400, "Você é a única pessoa desta família.");
  await moveToNewHousehold(user.id, user.name);
  await audit(user.id, "household.left", "household", user.household_id);
}

/** Apaga a conta e todos os dados pessoais (transações, conversas, notas, regras…). */
export async function deleteAccount(user: SessionUser, password: string) {
  const row = await one<{ password_hash: string }>(`SELECT password_hash FROM profiles WHERE id = $1`, [user.id]);
  if (!row || !(await verifyPassword(password, row.password_hash))) throw new HttpError(400, "Senha incorreta");
  const next = await handOver(user.household_id, user.id);
  if (next) await query(`DELETE FROM profiles WHERE id = $1`, [user.id]);
  // Era a última pessoa: apaga a família inteira (inclui integrantes de exemplo e metas)
  else await query(`DELETE FROM households WHERE id = $1`, [user.household_id]);
}
