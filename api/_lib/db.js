import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';
import { hashPassword, newId } from './auth.js';
import { DEFAULT_CERTIFICATES, DEFAULT_STAGES } from './seed.js';

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
  await q`INSERT INTO docs (kind, id, data) VALUES ('setting', 'customColumns', ${JSON.stringify({ value: [] })}::jsonb) ON CONFLICT DO NOTHING`;
  await q`INSERT INTO docs (kind, id, data) VALUES ('setting', 'certificateStages', ${JSON.stringify({ value: DEFAULT_CERTIFICATES })}::jsonb) ON CONFLICT DO NOTHING`;

  const [{ n: userCount }] = await q`SELECT count(*)::int AS n FROM users`;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (userCount === 0 && email && password) {
    await q`INSERT INTO users (id, email, name, role, password_hash)
            VALUES (${newId()}, ${email}, 'Admin', 'admin', ${hashPassword(password)})
            ON CONFLICT (email) DO NOTHING`;
  }
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
