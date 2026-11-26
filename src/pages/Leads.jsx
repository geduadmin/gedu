import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Columns3, Download, Inbox, Plus, Search, Trash2 } from 'lucide-react';
import { useLookups, useStore, useVisibleLeads } from '../store/StoreContext';
import { FLAGS } from '../store/defaults';
import LeadModal from '../components/LeadModal';
import { Empty, FlagIcons, StageBadge } from '../components/ui';
import { exportLeads } from '../lib/excel';
import { fmtDate, timeAgo } from '../lib/utils';
import { t } from '../i18n';

const PAGE = 50;
const COLS_KEY = 'lf_hidden_cols';

export default function Leads() {
  const { state, user, actions } = useStore();
  const lookups = useLookups();
  const { stages, stageById, userById, agents } = lookups;
  const leads = useVisibleLeads();
  const isAdmin = user.role === 'admin';

  const [params] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => {
    setQ(urlQ);
    setPage(0);
  }, [urlQ]);
  const [stage, setStage] = useState('all');
  const [owner, setOwner] = useState('all');
  const [flag, setFlag] = useState('any');
  const [sort, setSort] = useState({ key: 'createdAt', dir: -1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [showCols, setShowCols] = useState(false);
  const [hidden, setHidden] = useState(() => new Set(JSON.parse(localStorage.getItem(COLS_KEY) || '["nationality","gender"]')));

  const columns = useMemo(
    () => [
      { key: 'name', label: t('Name'), get: (l) => l.name, render: (l) => <b>{l.name}</b> },
      { key: 'phone', label: t('Phone'), get: (l) => l.phone, render: (l) => <bdi dir="ltr">{l.phone}</bdi> },
      { key: 'email', label: t('Email'), get: (l) => l.email, render: (l) => <bdi dir="ltr">{l.email}</bdi> },
      { key: 'stage', label: t('Status'), get: (l) => stageById[l.stageId]?.order ?? 99, render: (l) => <StageBadge stage={stageById[l.stageId]} /> },
      ...(isAdmin ? [{ key: 'owner', label: t('Employee'), get: (l) => userById[l.ownerId]?.name ?? '' }] : []),
      { key: 'city', label: t('City'), get: (l) => l.city },
      { key: 'country', label: t('Country'), get: (l) => l.country },
      { key: 'nationality', label: t('Nationality'), get: (l) => l.nationality },
      { key: 'gender', label: t('Gender'), get: (l) => l.gender, render: (l) => t(l.gender) },
      { key: 'certificateStage', label: t('Certificate'), get: (l) => l.certificateStage, render: (l) => t(l.certificateStage) },
      { key: 'flags', label: t('Contact'), get: (l) => Object.values(l.flags).filter(Boolean).length, render: (l) => <FlagIcons flags={l.flags} /> },
      { key: 'createdAt', label: t('Created'), get: (l) => l.createdAt, render: (l) => fmtDate(l.createdAt) },
      { key: 'lastContactAt', label: t('Last contact'), get: (l) => l.lastContactAt ?? '', render: (l) => <span title={fmtDate(l.lastContactAt)}>{timeAgo(l.lastContactAt)}</span> },
      ...state.customColumns.map((c) => ({
        key: 'c_' + c.id,
        label: c.label,
        get: (l) => l.custom?.[c.id] ?? '',
        render: (l) => (c.type === 'checkbox' ? (l.custom?.[c.id] ? t('Yes') : t('No')) : String(l.custom?.[c.id] ?? '')),
      })),
      { key: 'files', label: t('Files'), get: (l) => l.files.length },
    ],
    [state.customColumns, stageById, userById, isAdmin],
  );
  const visibleCols = columns.filter((c) => !hidden.has(c.key));

  const toggleCol = (key) => {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    setHidden(next);
    localStorage.setItem(COLS_KEY, JSON.stringify([...next]));
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const col = columns.find((c) => c.key === sort.key) ?? columns[0];
    return leads
      .filter((l) => stage === 'all' || l.stageId === stage)
      .filter((l) => owner === 'all' || l.ownerId === owner)
      .filter((l) => {
        if (flag === 'any') return true;
        if (flag.startsWith('not:')) return !l.flags[flag.slice(4)];
        return l.flags[flag];
      })
      .filter((l) => !s || [l.name, l.phone, l.email, l.city, l.country, l.notes].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => {
        const x = col.get(a);
        const y = col.get(b);
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
  }, [leads, q, stage, owner, flag, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const toggle = (id) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  const togglePage = () => {
    const n = new Set(sel);
    rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
    setSel(n);
  };

  const ids = [...sel];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t(isAdmin ? 'All leads' : 'My leads')}</h1>
          <p>
            {t('{n} of {total} leads', { n: filtered.length, total: leads.length })}
          </p>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportLeads(filtered, { ...lookups, customColumns: state.customColumns }, 'leads.xlsx')}>
          <Download size={15} /> {t('Export Excel')}
        </button>
        <button className="btn primary" onClick={() => setOpen({ new: true })}>
          <Plus size={15} /> {t('Add lead')}
        </button>
      </div>

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="search">
          <Search size={15} />
          <input className="input" placeholder={t('Search…')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <select className="select" style={{ width: 170 }} value={stage} onChange={(e) => { setStage(e.target.value); setPage(0); }}>
          <option value="all">{t('All statuses')}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select className="select" style={{ width: 170 }} value={owner} onChange={(e) => { setOwner(e.target.value); setPage(0); }}>
            <option value="all">{t('All employees')}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <select className="select" style={{ width: 210 }} value={flag} onChange={(e) => { setFlag(e.target.value); setPage(0); }}>
          <option value="any">{t('Any contact status')}</option>
          {FLAGS.map((f) => (
            <option key={f.key} value={f.key}>
              {t(f.label)}
            </option>
          ))}
          {FLAGS.map((f) => (
            <option key={'n' + f.key} value={'not:' + f.key}>
              {t('NOT {what}', { what: t(f.label).toLowerCase() })}
            </option>
          ))}
        </select>
        <div style={{ position: 'relative' }}>
          <button className="btn" onClick={() => setShowCols((v) => !v)}>
            <Columns3 size={15} /> {t('Columns')}
          </button>
          {showCols && (
            <div className="card card-pad stack" style={{ position: 'absolute', zIndex: 5, top: 40, insetInlineStart: 0, width: 220, gap: 6, boxShadow: 'var(--shadow-lg)' }}>
              {columns.map((c) => (
                <label className="check" key={c.key}>
                  <input type="checkbox" checked={!hidden.has(c.key)} disabled={c.key === 'name'} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {sel.size > 0 && (
        <div className="card card-pad row wrap" style={{ marginBottom: 12, background: 'var(--primary-wash)' }}>
          <b>{t('{n} selected', { n: sel.size })}</b>
          <select className="select" style={{ width: 190 }} value="" onChange={(e) => { actions.bulkUpdateLeads(ids, { stageId: e.target.value }); setSel(new Set()); }}>
            <option value="">{t('Move to status…')}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.name)}
              </option>
            ))}
          </select>
          {isAdmin && (
            <select className="select" style={{ width: 190 }} value="" onChange={(e) => { actions.bulkUpdateLeads(ids, { ownerId: e.target.value }); setSel(new Set()); }}>
              <option value="">{t('Assign to employee…')}</option>
              {state.users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={() => exportLeads(leads.filter((l) => sel.has(l.id)), { ...lookups, customColumns: state.customColumns }, 'selected-leads.xlsx')}>
            <Download size={15} /> {t('Export selected')}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(t('Delete {n} leads? This cannot be undone.', { n: sel.size }))) {
                actions.deleteLeads(ids);
                setSel(new Set());
              }
            }}
          >
            <Trash2 size={15} /> {t('Delete')}
          </button>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => setSel(new Set())}>
            {t('Clear')}
          </button>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <Empty icon={Inbox} title={t('No leads found')}>
            {t('Add a lead or import an Excel sheet.')}
          </Empty>
        ) : (
          <>
            <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allOnPage} onChange={togglePage} />
                    </th>
                    {visibleCols.map((c) => (
                      <th key={c.key} className="sortable" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}>
                        <span className="row" style={{ gap: 4 }}>
                          {c.label}
                          {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => setOpen({ id: l.id })}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                      </td>
                      {visibleCols.map((c) => (
                        <td key={c.key}>{c.render ? c.render(l) : c.get(l)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted small">
                {t('Page {n} of {total}', { n: cur + 1, total: pages })}
              </span>
              <button className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                {t('Previous')}
              </button>
              <button className="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
                {t('Next')}
              </button>
            </div>
          </>
        )}
      </div>

      {open && <LeadModal leadId={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}
