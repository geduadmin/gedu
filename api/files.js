import { del, get, put } from '@vercel/blob';
import { requireUser } from './_lib/auth.js';
import { ensureSchema, sql } from './_lib/db.js';
import { handle, HttpError, json } from './_lib/http.js';

// Vercel Functions accept request bodies up to 4.5 MB.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** The lead must exist and (for employees) belong to the signed-in user. */
async function checkLead(q, me, leadId) {
  if (!leadId || !/^[\w-]{1,100}$/.test(leadId)) throw new HttpError(400, 'Invalid lead');
  const [lead] = await q`SELECT owner_id FROM docs WHERE kind = 'lead' AND id = ${leadId} AND NOT deleted`;
  if (!lead) throw new HttpError(404, 'Lead not found');
  if (me.role !== 'admin' && lead.owner_id !== me.id) throw new HttpError(403, 'Not your lead');
}

/** Paths look like leads/<leadId>/<random>-<name>; returns the lead id. */
function leadIdFromPath(path) {
  const m = /^leads\/([\w-]{1,100})\/[^/]+$/.exec(path || '');
  if (!m) throw new HttpError(400, 'Invalid file path');
  return m[1];
}

const safeName = (n) => String(n || 'file').replace(/[^\w.\- ؀-ۿ]+/g, '_').slice(0, 120) || 'file';

// POST /api/files?leadId=...&name=...   body = the file bytes
export const POST = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireUser(request, q);
  const params = new URL(request.url).searchParams;
  const leadId = params.get('leadId');
  await checkLead(q, me, leadId);

  const body = await request.arrayBuffer();
  if (!body.byteLength) throw new HttpError(400, 'Empty file');
  if (body.byteLength > MAX_FILE_BYTES) throw new HttpError(413, 'Files can be at most 4 MB');

  const name = safeName(params.get('name'));
  const blob = await put(`leads/${leadId}/${name}`, body, {
    access: 'private',
    addRandomSuffix: true,
    contentType: request.headers.get('content-type') || 'application/octet-stream',
  });
  return json({ path: blob.pathname, size: body.byteLength }, 201);
});

// GET /api/files?path=...&name=...   streams the file (only to people allowed to see the lead)
export const GET = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireUser(request, q);
  const params = new URL(request.url).searchParams;
  const path = params.get('path');
  await checkLead(q, me, leadIdFromPath(path));

  const result = await get(path, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) throw new HttpError(404, 'File not found');
  const name = safeName(params.get('name') || path.split('/').pop());
  return new Response(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});

// DELETE /api/files?path=...
export const DELETE = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireUser(request, q);
  const path = new URL(request.url).searchParams.get('path');
  await checkLead(q, me, leadIdFromPath(path));
  await del(path);
  return json({ ok: true });
});
