import { hashPassword, newId, requireAdmin, requireUser, verifyPassword } from './_lib/auth.js';
import { ensureSchema, safeUser, sql } from './_lib/db.js';
import { handle, HttpError, json, readJson } from './_lib/http.js';

const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function checkPassword(p) {
  if (String(p).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
}

// POST /api/users  {name, email, phone, role, active, password}        (admin) create
export const POST = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  await requireAdmin(request, q);
  const b = await readJson(request);
  const email = cleanEmail(b.email);
  if (!String(b.name || '').trim()) throw new HttpError(400, 'Name is required');
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email');
  checkPassword(b.password);
  const [dupe] = await q`SELECT id FROM users WHERE email = ${email}`;
  if (dupe) throw new HttpError(409, 'Another account already uses this email');
  const [u] = await q`
    INSERT INTO users (id, email, name, phone, role, active, password_hash)
    VALUES (${newId()}, ${email}, ${String(b.name).trim()}, ${String(b.phone || '')}, ${b.role === 'admin' ? 'admin' : 'agent'},
            ${b.active !== false}, ${hashPassword(b.password)})
    RETURNING *`;
  return json({ user: safeUser(u) }, 201);
});

// PATCH /api/users?id=...  {name?, email?, phone?, role?, active?, password?}   (admin)
// PATCH /api/users?id=<me> {currentPassword, password}                          (anyone: own password)
export const PATCH = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireUser(request, q);
  const id = new URL(request.url).searchParams.get('id');
  const b = await readJson(request);

  if (me.role !== 'admin') {
    if (id !== me.id) throw new HttpError(403, 'Only an admin can do this.');
    if (!verifyPassword(b.currentPassword || '', me.password_hash)) throw new HttpError(400, 'Current password is wrong');
    checkPassword(b.password);
    await q`UPDATE users SET password_hash = ${hashPassword(b.password)}, updated_at = now() WHERE id = ${me.id}`;
    return json({ user: safeUser(me) });
  }

  const [u] = await q`SELECT * FROM users WHERE id = ${id}`;
  if (!u) throw new HttpError(404, 'User not found');
  const next = {
    name: b.name !== undefined ? String(b.name).trim() : u.name,
    email: b.email !== undefined ? cleanEmail(b.email) : u.email,
    phone: b.phone !== undefined ? String(b.phone) : u.phone,
    role: b.role !== undefined ? (b.role === 'admin' ? 'admin' : 'agent') : u.role,
    active: b.active !== undefined ? !!b.active : u.active,
  };
  if (!next.name) throw new HttpError(400, 'Name is required');
  if (!isEmail(next.email)) throw new HttpError(400, 'Enter a valid email');
  if (id === me.id && (next.role !== 'admin' || !next.active)) throw new HttpError(400, "You can't deactivate or demote your own account");
  const [dupe] = await q`SELECT id FROM users WHERE email = ${next.email} AND id <> ${id}`;
  if (dupe) throw new HttpError(409, 'Another account already uses this email');
  if (b.password) checkPassword(b.password);
  const hash = b.password ? hashPassword(b.password) : u.password_hash;

  const [saved] = await q`
    UPDATE users SET name = ${next.name}, email = ${next.email}, phone = ${next.phone}, role = ${next.role},
      active = ${next.active}, password_hash = ${hash}, updated_at = now()
    WHERE id = ${id} RETURNING *`;
  return json({ user: safeUser(saved) });
});

// DELETE /api/users?id=...   (admin; refused while the user still has leads)
export const DELETE = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireAdmin(request, q);
  const id = new URL(request.url).searchParams.get('id');
  if (id === me.id) throw new HttpError(400, "You can't delete your own account");
  const [{ n }] = await q`SELECT count(*)::int AS n FROM docs WHERE kind = 'lead' AND owner_id = ${id} AND NOT deleted`;
  if (n > 0) throw new HttpError(409, `This employee still has ${n} leads. Move them first, or deactivate the account.`);
  await q`DELETE FROM users WHERE id = ${id}`;
  return json({ ok: true });
});
