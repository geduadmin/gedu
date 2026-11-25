import { CheckCircle2, CircleAlert, Zap } from 'lucide-react';

/** Shown when the server storage isn't configured yet — lists exactly what's missing. */
export default function Setup({ health }) {
  const items = [
    {
      ok: !!health,
      title: 'API reachable',
      help: 'The /api functions did not respond. Redeploy the project on Vercel.',
    },
    {
      ok: !!health?.db,
      title: 'Database connected (Neon Postgres)',
      help: 'Vercel → your project → Storage → Create → Neon (Postgres) → connect it to this project. It adds DATABASE_URL.',
    },
    {
      ok: !!health?.session,
      title: 'SESSION_SECRET set',
      help: 'Vercel → Settings → Environment Variables → add SESSION_SECRET with a random value of at least 32 characters.',
    },
    {
      ok: !!health?.admin,
      title: 'First admin account (ADMIN_EMAIL + ADMIN_PASSWORD)',
      help: 'Add ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters). Used once to create the first admin when the database is empty.',
    },
    {
      ok: !!health?.blob,
      title: 'File storage connected (Vercel Blob, private) — optional',
      help: 'Storage → Create → Blob → choose Private → connect it to this project. Needed only for attaching files to leads.',
    },
  ];
  return (
    <div className="login-wrap" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-side">
        <div className="card card-pad stack" style={{ maxWidth: 640, gap: 16 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="brand-mark">
              <Zap size={19} fill="#fff" />
            </div>
            <div>
              <h2>Finish setting up LeadFlow</h2>
              <div className="small ink2">The server storage isn't fully configured yet. After changing settings in Vercel, redeploy.</div>
            </div>
          </div>
          {items.map((it) => (
            <div key={it.title} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              {it.ok ? <CheckCircle2 size={20} color="#12a150" /> : <CircleAlert size={20} color="#e5484d" />}
              <div>
                <b>{it.title}</b>
                {!it.ok && <div className="small ink2" style={{ marginTop: 2 }}>{it.help}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
