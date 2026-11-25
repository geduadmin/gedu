import { json } from './_lib/http.js';

// Tells the app whether the server storage is configured (never returns secret values).
export function GET() {
  return json({
    ok: true,
    db: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    blob: !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN),
    session: (process.env.SESSION_SECRET || '').length >= 32,
    admin: !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
  });
}
