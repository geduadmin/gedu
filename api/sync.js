import { del as delBlob } from '@vercel/blob';
import { requireUser } from './_lib/auth.js';
import { ensureSchema, sql } from './_lib/db.js';
import { handle, HttpError, json, readJson } from './_lib/http.js';

const KINDS = new Set(['stage', 'setting', 'lead', 'activity', 'meeting']);
const MAX_OPS = 500;
const MAX_DOC_BYTES = 300_000;

/*
  POST /api/sync { ops: [{ kind, op: 'put' | 'del', id, data? }] }
  Applies the changes in one transaction. Rules for call-center employees (admins can do anything):
  - statuses and settings: admin only
  - leads: only their own, and they can't hand a lead to someone else
  - activity & meetings: only on their own leads; meetings must be assigned to themselves
*/
export const POST = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireUser(request, q);
  const isAdmin = me.role === 'admin';
  const { ops } = await readJson(request);

  if (!Array.isArray(ops) || ops.length === 0) return json({ ok: true, applied: 0 });
  if (ops.length > MAX_OPS) throw new HttpError(413, `Send at most ${MAX_OPS} changes at a time`);

  for (const o of ops) {
    if (!KINDS.has(o?.kind) || !['put', 'del'].includes(o.op) || typeof o.id !== 'string' || !o.id || o.id.length > 100)
      throw new HttpError(400, 'Invalid change');
    if (o.op === 'put') {
      if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) throw new HttpError(400, 'Invalid change data');
      if (o.kind !== 'setting' && o.data.id !== o.id) throw new HttpError(400, 'Change id mismatch');
      if (JSON.stringify(o.data).length > MAX_DOC_BYTES) throw new HttpError(413, 'A record is too large');
    }
  }

  // Existing rows for everything we touch (needed for permission checks and file cleanup).
  const existingRows = await q`
    SELECT kind, id, owner_id, lead_id, deleted, data FROM docs
    WHERE (kind, id) IN (SELECT * FROM unnest(${ops.map((o) => o.kind)}::text[], ${ops.map((o) => o.id)}::text[]))`;
  const existing = new Map(existingRows.map((r) => [`${r.kind}:${r.id}`, r]));

  if (!isAdmin) {
    if (ops.some((o) => o.kind === 'stage' || o.kind === 'setting')) throw new HttpError(403, 'Only an admin can change statuses and settings.');

    // Who owns each referenced lead after this batch?
    const leadIds = new Set();
    for (const o of ops) {
      if (o.kind === 'lead') leadIds.add(o.id);
      else if (o.op === 'put') leadIds.add(o.data.leadId);
      else if (existing.get(`${o.kind}:${o.id}`)?.lead_id) leadIds.add(existing.get(`${o.kind}:${o.id}`).lead_id);
    }
    const leadRows = leadIds.size ? await q`SELECT id, owner_id, deleted FROM docs WHERE kind = 'lead' AND id = ANY(${[...leadIds]})` : [];
    const dbOwner = new Map(leadRows.filter((r) => !r.deleted).map((r) => [r.id, r.owner_id]));
    const batchOwner = new Map(ops.filter((o) => o.kind === 'lead' && o.op === 'put').map((o) => [o.id, o.data.ownerId]));
    const ownsLead = (id) => (batchOwner.has(id) ? batchOwner.get(id) === me.id : dbOwner.get(id) === me.id);
    const deny = () => {
      throw new HttpError(403, 'You can only change your own leads.');
    };

    for (const o of ops) {
      const ex = existing.get(`${o.kind}:${o.id}`);
      if (o.kind === 'lead') {
        if (ex && !ex.deleted && ex.owner_id !== me.id) deny();
        if (o.op === 'put' && o.data.ownerId !== me.id) deny();
      } else {
        const leadId = o.op === 'put' ? o.data.leadId : ex?.lead_id;
        if (ex && !ex.deleted && ex.lead_id && !ownsLead(ex.lead_id)) deny();
        if (leadId && !ownsLead(leadId)) deny();
        if (o.op === 'put' && o.kind === 'meeting' && o.data.agentId !== me.id) deny();
        if (o.op === 'put' && o.kind === 'activity' && !ex && o.data.userId !== me.id) deny();
      }
    }
  }

  const ownerOf = (o) => (o.kind === 'lead' ? o.data.ownerId : o.kind === 'activity' ? o.data.userId : o.kind === 'meeting' ? o.data.agentId : null) ?? null;
  const leadOf = (o) => (o.kind === 'lead' ? o.id : o.kind === 'activity' || o.kind === 'meeting' ? o.data.leadId : null) ?? null;

  await q.transaction(
    ops.map((o) =>
      o.op === 'put'
        ? q`INSERT INTO docs (kind, id, owner_id, lead_id, data, deleted, updated_at)
            VALUES (${o.kind}, ${o.id}, ${ownerOf(o)}, ${leadOf(o)}, ${JSON.stringify(o.data)}::jsonb, false, clock_timestamp())
            ON CONFLICT (kind, id) DO UPDATE SET owner_id = EXCLUDED.owner_id, lead_id = EXCLUDED.lead_id,
              data = EXCLUDED.data, deleted = false, updated_at = clock_timestamp()`
        : q`INSERT INTO docs (kind, id, data, deleted, updated_at) VALUES (${o.kind}, ${o.id}, NULL, true, clock_timestamp())
            ON CONFLICT (kind, id) DO UPDATE SET data = NULL, deleted = true, updated_at = clock_timestamp()`,
    ),
  );

  // Remove the stored files of deleted leads.
  const paths = ops
    .filter((o) => o.kind === 'lead' && o.op === 'del')
    .flatMap((o) => existing.get(`lead:${o.id}`)?.data?.files ?? [])
    .map((f) => f.path)
    .filter(Boolean);
  if (paths.length) await delBlob(paths).catch((e) => console.error('Blob cleanup failed', e));

  return json({ ok: true, applied: ops.length });
});
