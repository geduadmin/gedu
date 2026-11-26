import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';
import { hashPassword, newId } from './auth.js';
import { DEFAULT_ADMIN_NAME, DEFAULT_CERTIFICATES, DEFAULT_STAGES } from './seed.js';

let client;
export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new HttpError(503, 'Database is not connected (DATABASE_URL is missing).');
    client = neon(url);
  }
  return client;
}

/*
  Schema
  - users: accounts (password hashes never leave the server)
  - docs:  every other record as a JSON document — kind = stage | setting | lead | activity | meeting.
           owner_id / lead_id are copied out of the JSON for permission checks and filtering.
           Deletes are kept as tombstones (deleted = true) so other browsers learn about them.
*/
let ready;
export function ensureSchema() {
  ready ??= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      phone text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT 'agent',
      active boolean NOT NULL DEFAULT true,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS docs (
      kind text NOT NULL,
      id text NOT NULL,
      owner_id text,
      lead_id text,
      data jsonb,
      deleted boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (kind, id)
    )`;
    await q`CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs (updated_at, kind, id)`;
    await q`CREATE INDEX IF NOT EXISTS docs_owner_idx ON docs (kind, owner_id)`;
    await q`CREATE INDEX IF NOT EXISTS docs_lead_idx ON docs (kind, lead_id)`;
    await bootstrap(q);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/* One-time: add the two "meeting done" statuses to a database created before they existed,
   right after the meeting status. A setting doc marks it done, so statuses an admin deletes
   are not re-created. Fixed ids keep two cold starts at once from adding them twice. */
const MEETING_OUTCOME_KINDS = ['meeting_candidate', 'meeting_not_candidate'];
async function addMeetingOutcomeStages(q) {
  const [done] = await q`SELECT 1 AS x FROM docs WHERE kind = 'setting' AND id = 'meetingStagesV1'`;
  if (done) return;
  const stages = (await q`SELECT data FROM docs WHERE kind = 'stage' AND NOT deleted`).map((r) => r.data).sort((a, b) => a.order - b.order);
  const have = new Set(stages.map((s) => s.kind));
  const add = DEFAULT_STAGES.filter(([, kind]) => MEETING_OUTCOME_KINDS.includes(kind) && !have.has(kind))
    .map(([name, kind, color]) => ({ id: `stage-${kind}`, name, kind, color, isNew: true }));
  const list = [...stages];
  const at = list.findIndex((s) => s.kind === 'meeting');
  list.splice(at < 0 ? list.length : at + 1, 0, ...add);
  const writes = [];
  list.forEach(({ isNew, ...s }, order) => {
    if (isNew) writes.push(q`INSERT INTO docs (kind, id, data) VALUES ('stage', ${s.id}, ${JSON.stringify({ ...s, order })}::jsonb) ON CONFLICT DO NOTHING`);
    else if (s.order !== order && add.length)
      writes.push(q`UPDATE docs SET data = jsonb_set(data, '{order}', to_jsonb(${order}::int)), updated_at = clock_timestamp() WHERE kind = 'stage' AND id = ${s.id}`);
  });
  writes.push(q`INSERT INTO docs (kind, id, data) VALUES ('setting', 'meetingStagesV1', ${JSON.stringify({ value: true })}::jsonb) ON CONFLICT DO NOTHING`);
  await q.transaction(writes);
}

/** First run: default statuses/settings, and the first admin from ADMIN_EMAIL / ADMIN_PASSWORD. */
async function bootstrap(q) {
  const [{ n: stageCount }] = await q`SELECT count(*)::int AS n FROM docs WHERE kind = 'stage'`;
  if (stageCount === 0) {
    await q.transaction(
      DEFAULT_STAGES.map(([name, kind, color], order) => {
        const id = newId();
        return q`INSERT INTO docs (kind, id, data) VALUES ('stage', ${id}, ${JSON.stringify({ id, name, kind, color, order })}::jsonb)
                 ON CONFLICT DO NOTHING`;
      }),
    );
  }
  await addMeetingOutcomeStages(q);
  await q`INSERT INTO docs (kind, id, data) VALUES ('setting', 'customColumns', ${JSON.stringify({ value: [] })}::jsonb) ON CONFLICT DO NOTHING`;
  await q`INSERT INTO docs (kind, id, data) VALUES ('setting', 'certificateStages', ${JSON.stringify({ value: DEFAULT_CERTIFICATES })}::jsonb) ON CONFLICT DO NOTHING`;

  const [{ n: userCount }] = await q`SELECT count(*)::int AS n FROM users`;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || DEFAULT_ADMIN_NAME;
  if (userCount === 0 && email && password) {
    await q`INSERT INTO users (id, email, name, role, password_hash)
            VALUES (${newId()}, ${email}, ${name}, 'admin', ${hashPassword(password)})
            ON CONFLICT (email) DO NOTHING`;
  }
  // Admin created by an earlier version got the placeholder name 'Admin' — give it the real name once.
  if (email) await q`UPDATE users SET name = ${name}, updated_at = now() WHERE email = ${email} AND role = 'admin' AND name = 'Admin'`;
}

export const safeUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    active: u.active,
    createdAt: new Date(u.created_at).toISOString(),
  };
