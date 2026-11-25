import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, CalendarClock, Check, CloudUpload, FileSpreadsheet, KanbanSquare, LayoutDashboard, LogOut, PhoneOutgoing, Search, Settings, Table2, Users, Zap,
} from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import { fmtDateTime } from '../lib/utils';
import { Avatar } from './ui';

const CLOSED_KINDS = ['registered', 'not_interested', 'blocked'];

function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, setOpen]);
  return ref;
}

export default function Layout() {
  const { state, user, actions, mode, syncStatus, syncError } = useStore();
  const { stageById, leadById, agents } = useLookups();
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';
  const [q, setQ] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useOutsideClose(bellOpen, setBellOpen);
  const menuRef = useOutsideClose(menuOpen, setMenuOpen);

  // Leads waiting for follow-up: open leads with no contact for 3+ days.
  const waiting = useMemo(() => {
    const cutoff = Date.now() - 3 * 864e5;
    return state.leads.filter(
      (l) =>
        (isAdmin || l.ownerId === user.id) &&
        !CLOSED_KINDS.includes(stageById[l.stageId]?.kind) &&
        (!l.lastContactAt || new Date(l.lastContactAt).getTime() < cutoff),
    ).length;
  }, [state.leads, stageById, isAdmin, user.id]);

  // Upcoming meetings in the next 7 days.
  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    const week = new Date(Date.now() + 7 * 864e5).toISOString();
    return state.meetings
      .filter((m) => m.status === 'scheduled' && m.scheduledAt >= now && m.scheduledAt <= week && (isAdmin || m.agentId === user.id))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [state.meetings, isAdmin, user.id]);

  const menu = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ...(isAdmin ? [] : [{ to: '/pipeline', label: 'My Pipeline', icon: KanbanSquare }]),
    { to: '/leads', label: isAdmin ? 'All Leads' : 'My Leads', icon: Table2 },
    { to: '/meetings', label: 'Meetings', icon: CalendarClock, count: upcoming.length || null },
  ];
  const manage = [
    { to: '/import', label: 'Import Excel', icon: FileSpreadsheet },
    ...(isAdmin
      ? [
          { to: '/employees', label: 'Employees', icon: Users },
          { to: '/settings', label: 'Settings', icon: Settings },
        ]
      : []),
  ];

  // Admin: one Kanban board per employee in the sidebar.
  const leadCount = useMemo(() => {
    const c = {};
    for (const l of state.leads) c[l.ownerId] = (c[l.ownerId] ?? 0) + 1;
    return c;
  }, [state.leads]);
  const pipelines = isAdmin
    ? [
        { to: '/pipeline', label: 'All pipelines', icon: KanbanSquare, end: true, count: state.leads.length, quiet: true },
        ...agents
          .filter((a) => a.active)
          .map((a) => ({ to: `/pipeline/${a.id}`, label: a.name, avatar: a.name, count: leadCount[a.id] ?? 0, quiet: true })),
      ]
    : [];

  const link = (it) => (
    <NavLink key={it.to} to={it.to} end={it.end}>
      {it.avatar ? <Avatar name={it.avatar} sm /> : <it.icon size={18} />}
      <span className="nav-text">{it.label}</span>
      {it.count != null && it.count !== false && (it.quiet || it.count > 0) && <span className={`nav-count ${it.quiet ? 'quiet' : ''}`}>{it.count}</span>}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={19} fill="#fff" />
          </div>
          <div>
            <div className="brand-name">LeadFlow</div>
            <div className="brand-sub">Follow-up CRM</div>
          </div>
        </div>
        <div className="nav-label">Menu</div>
        <nav className="nav">{menu.map(link)}</nav>
        {isAdmin && (
          <>
            <div className="nav-label">Pipelines</div>
            <nav className="nav">{pipelines.map(link)}</nav>
          </>
        )}
        <div className="nav-label">Manage</div>
        <nav className="nav">{manage.map(link)}</nav>

        <div className="promo">
          <div className="promo-icon">
            <PhoneOutgoing size={20} />
          </div>
          <div className="promo-title">
            {waiting} lead{waiting === 1 ? '' : 's'} waiting for a follow-up
          </div>
          <div className="promo-text">Open leads with no contact in the last 3 days.</div>
          <button className="btn sm" onClick={() => navigate('/pipeline')}>
            Start calling →
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar no-print">
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/leads?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search size={16} />
            <input className="input" placeholder="Search leads by name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="spacer" />
          {mode === 'remote' && (
            <span className={`sync-chip ${syncStatus}`} title={syncError || 'All changes are saved to the shared database'}>
              {syncStatus === 'saving' ? <CloudUpload size={14} /> : syncStatus === 'error' ? <AlertTriangle size={14} /> : <Check size={14} />}
              {syncStatus === 'saving' ? 'Saving…' : syncStatus === 'error' ? 'Not saved' : 'Saved'}
            </span>
          )}

          <div ref={bellRef} style={{ position: 'relative' }}>
            <button className="round-btn" title="Upcoming meetings" onClick={() => setBellOpen((v) => !v)}>
              <Bell size={18} />
              {upcoming.length > 0 && <span className="ping num">{upcoming.length}</span>}
            </button>
            {bellOpen && (
              <div className="dropdown" style={{ width: 320 }}>
                <div className="dd-head">Meetings in the next 7 days</div>
                {upcoming.length === 0 && <div className="small muted" style={{ padding: '4px 10px 10px' }}>Nothing scheduled.</div>}
                {upcoming.slice(0, 6).map((m) => (
                  <button key={m.id} className="dd-item" onClick={() => { setBellOpen(false); navigate('/meetings'); }}>
                    <div className="tl-icon" style={{ width: 30, height: 30 }}>
                      <CalendarClock size={14} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{leadById[m.leadId]?.name ?? 'Lead'}</div>
                      <div className="small muted">{fmtDateTime(m.scheduledAt)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
              <Avatar name={user.name} />
              <div className="who">
                <b>{user.name}</b>
                <span>{isAdmin ? 'Admin' : 'Call center sales'}</span>
              </div>
            </button>
            {menuOpen && (
              <div className="dropdown">
                <div className="dd-head">
                  {user.name}
                  <div className="small muted" style={{ fontWeight: 400 }}>{user.email}</div>
                </div>
                <button className="dd-item" onClick={actions.logout}>
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="main">
          {mode === 'remote' && syncStatus === 'error' && syncError && <div className="notice no-print" style={{ marginBottom: 16 }}>{syncError}</div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
