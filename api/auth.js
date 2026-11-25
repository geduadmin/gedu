import { clearCookie, requireUser, sessionCookie, verifyPassword } from './_lib/auth.js';
import { ensureSchema, safeUser, sql } from './_lib/db.js';
import { handle, HttpError, json, readJson } from './_lib/http.js';

// GET  /api/auth                      -> the signed-in user
// POST /api/auth {action:'login', email, password}
// POST /api/auth {action:'logout'}
export const GET = handle(async (request) => {
  await ensureSchema();
  return json({ user: safeUser(await requireUser(request, sql())) });
});

export const POST = handle(async (request) => {
  const body = await readJson(request);
  if (body.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(request) });
  if (body.action !== 'login') throw new HttpError(400, 'Unknown action');

  await ensureSchema();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const q = sql();
  const [u] = await q`SELECT * FROM users WHERE email = ${email}`;
  if (!u || !verifyPassword(password, u.password_hash)) {
    const [{ n }] = await q`SELECT count(*)::int AS n FROM users`;
    if (n === 0) throw new HttpError(503, 'No accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in Vercel, then redeploy.');
    // small delay to slow down password guessing
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'Wrong email or password');
  }
  if (!u.active) throw new HttpError(403, 'This account is deactivated');
  return json({ user: safeUser(u) }, 200, { 'Set-Cookie': sessionCookie(request, u.id) });
});
