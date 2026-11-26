import { requireUser } from './_lib/auth.js';
import { ensureSchema, safeUser, sql } from './_lib/db.js';
import { handle, json } from './_lib/http.js';

const PAGE = 2500;

/*
  GET /api/data?cursor=<timestamp>|<kind>|<id>[&overlap=60][&page=2]
  Returns documents changed after the cursor (all of them when there is no cursor), page by page.
  The cursor keeps the database's exact (microsecond) timestamp as text so paging never repeats.
  overlap=N re-reads the last N seconds, so changes committed slightly out of order aren't missed.

  Admins get everything. Employees get statuses, settings, and only their own leads
  (plus those leads' activity and meetings).
*/
export const GET = handle(async (request) => {
  await ensureSchema();
  const q = sql();
  const me = await requireUser(request, q);
  const isAdmin = me.role === 'admin';

  const params = new URL(request.url).searchParams;
  const [cTime, cKind, cId] = (params.get('cursor') || '').split('|');
  const overlap = Math.min(300, Math.max(0, Number(params.get('overlap')) || 0));
  const since = cTime || '1970-01-01T00:00:00Z';
  const kind = overlap ? '' : cKind || '';
  const id = overlap ? '' : cId || '';

  const rows = isAdmin
    ? await q`
        SELECT kind, id, data, deleted, updated_at::text AS ts FROM docs
        WHERE (updated_at, kind, id) > (${since}::timestamptz - make_interval(secs => ${overlap}), ${kind}, ${id})
        ORDER BY updated_at, kind, id LIMIT ${PAGE}`
    : await q`
        WITH mine AS (SELECT id FROM docs WHERE kind = 'lead' AND owner_id = ${me.id} AND NOT deleted)
        SELECT kind, id, data, deleted, updated_at::text AS ts FROM docs
        WHERE (updated_at, kind, id) > (${since}::timestamptz - make_interval(secs => ${overlap}), ${kind}, ${id})
          AND (
            kind = 'stage'
            OR (kind = 'setting' AND (id NOT LIKE 'columnOrder:%' OR id = ${'columnOrder:' + me.id}))
            OR (kind = 'lead' AND owner_id = ${me.id})
            OR (kind IN ('activity', 'meeting') AND lead_id IN (SELECT id FROM mine))
          )
        ORDER BY updated_at, kind, id LIMIT ${PAGE}`;

  const last = rows[rows.length - 1];
  const result = {
    docs: rows.map((r) => ({ kind: r.kind, id: r.id, deleted: r.deleted, data: r.deleted ? null : r.data })),
    cursor: last ? `${last.ts}|${last.kind}|${last.id}` : params.get('cursor') || '',
    more: rows.length === PAGE,
  };

  // Small lists, sent with the first page only.
  if (!params.get('page')) {
    const users = await q`SELECT * FROM users ORDER BY created_at`;
    result.users = users.map((u) => (isAdmin || u.id === me.id ? safeUser(u) : { ...safeUser(u), email: '', phone: '' }));
    result.me = safeUser(me);
    if (!isAdmin) {
      // lets the browser drop leads that were moved to someone else
      const ids = await q`SELECT id FROM docs WHERE kind = 'lead' AND owner_id = ${me.id} AND NOT deleted`;
      result.leadIds = ids.map((r) => r.id);
    }
  }
  return json(result);
});
