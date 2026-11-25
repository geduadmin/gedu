import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GraduationCap, TrendingUp, Zap } from 'lucide-react';
import { useStore } from '../store/StoreContext';

export default function Login() {
  const { state, user, actions, loadError } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const admin = state.users.find((u) => u.role === 'admin' && u.email === 'admin@admin.com' && u.password === 'admin123');
  const demoAgent = state.users.find((u) => u.role === 'agent' && u.email === 'rasha@leadflow.demo' && u.password === '123456');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError((await actions.login(email, password)) ?? '');
    setBusy(false);
  };
  const fill = (u, p) => {
    setEmail(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark" style={{ background: 'rgba(255,255,255,.2)', boxShadow: 'none' }}>
            <Zap size={19} fill="#fff" />
          </div>
          <div className="brand-name" style={{ fontSize: 20 }}>LeadFlow</div>
        </div>
        <div>
          <h2>Follow up every lead. Never lose a student again.</h2>
          <p>Track calls, WhatsApp messages and meetings for your whole call center team, with monthly performance at a glance.</p>
        </div>
        <div className="row wrap" style={{ gap: 14 }}>
          <div className="login-float">
            <div className="row" style={{ fontWeight: 650 }}><TrendingUp size={16} /> Monthly leaderboard</div>
            <div className="small" style={{ opacity: 0.85, marginTop: 4 }}>Calls, follow-ups and meetings per employee</div>
          </div>
          <div className="login-float">
            <div className="row" style={{ fontWeight: 650 }}><GraduationCap size={16} /> Lead to registration</div>
            <div className="small" style={{ opacity: 0.85, marginTop: 4 }}>Drag leads through your pipeline</div>
          </div>
        </div>
      </div>

      <div className="login-side">
        <form className="login stack" style={{ gap: 16 }} onSubmit={submit}>
          <div>
            <h1>Welcome back</h1>
            <p className="ink2" style={{ margin: '6px 0 0' }}>Sign in to your account to continue.</p>
          </div>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {(error || loadError) && <div className="error">{error || loadError}</div>}
          <button className="btn primary" style={{ justifyContent: 'center', padding: '11px' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {(admin || demoAgent) && (
            <div className="card card-pad stack" style={{ gap: 8, boxShadow: 'none', background: 'var(--surface-2)' }}>
              <b className="small">Demo accounts (click to fill)</b>
              {admin && (
                <button type="button" className="btn sm ghost" style={{ justifyContent: 'space-between' }} onClick={() => fill('admin@admin.com', 'admin123')}>
                  <span>Admin / manager</span> <span className="muted">admin@admin.com · admin123</span>
                </button>
              )}
              {demoAgent && (
                <button type="button" className="btn sm ghost" style={{ justifyContent: 'space-between' }} onClick={() => fill('rasha@leadflow.demo', '123456')}>
                  <span>Call center employee</span> <span className="muted">rasha@leadflow.demo · 123456</span>
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
