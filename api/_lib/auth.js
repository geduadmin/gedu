import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

export const newId = () => randomUUID();

/* ---------- passwords (scrypt, per-user salt) ---------- */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ---------- signed session cookie ---------- */
const COOKIE = 'lf_session';
const MAX_AGE = 30 * 24 * 3600; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new HttpError(503, 'SESSION_SECRET is missing or shorter than 32 characters.');
  return s;
}
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function sessionCookie(request, userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString('base64url');
  return cookieHeader(request, `${payload}.${sign(payload)}`, MAX_AGE);
}

export const clearCookie = (request) => cookieHeader(request, '', 0);

function cookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Returns the user id from a valid session cookie, or null. */
export function sessionUserId(request) {
  const raw = (request.headers.get('cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() / 1000 ? uid : null;
  } catch {
    return null;
  }
}

/** Load the signed-in, active user or throw 401. */
export async function requireUser(request, sql) {
  const uid = sessionUserId(request);
  if (!uid) throw new HttpError(401, 'Please sign in.');
  const [u] = await sql`SELECT * FROM users WHERE id = ${uid}`;
  if (!u || !u.active) throw new HttpError(401, 'Please sign in.');
  return u;
}

export async function requireAdmin(request, sql) {
  const u = await requireUser(request, sql);
  if (u.role !== 'admin') throw new HttpError(403, 'Only an admin can do this.');
  return u;
}
