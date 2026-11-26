import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, Database, Download, FileSpreadsheet, KanbanSquare, LayoutDashboard, Printer, Trophy, Users } from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import { computeLeaderboard, computeMonth, computeTrend, OUTCOMES, pipelineCounts } from '../lib/stats';
import { exportAllData, exportMonthReport, exportPipeline } from '../lib/excel';
import { monthKey as currentMonth, monthLabel, shiftMonth } from '../lib/utils';
import { Funnel, HBarChart, LinesChart } from '../components/charts';
import { Avatar, Empty, greeting, MonthPicker, Tabs } from '../components/ui';
import EmployeeReport, { ActivityHero, funnelSteps, KpiGrid, TREND_SERIES, withInterestedAll } from '../components/EmployeeReport';
import MeetingsList from '../components/MeetingsList';
import { t } from '../i18n';

export default function Dashboard() {
  const { state, user, actions, demoAvailable } = useStore();
  const lookups = useLookups();
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState('overview');
  const [employee, setEmployee] = useState(null);

  const isEmpty = state.leads.length === 0 && lookups.agents.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {t('{greeting}, {name}', { greeting: greeting(), name: user.name.split(' ')[0] })} <span aria-hidden>👋</span>
          </h1>
          <p>
            {t(month === currentMonth() ? "Here's what's happening with your leads in {month}." : "Here's what's happening with your leads in {month} (past month).", { month: monthLabel(month) })}
          </p>
        </div>
        <div className="spacer" />
        <MonthPicker value={month} onChange={setMonth} />
        <button className="btn no-print" onClick={() => window.print()} title={t('Print or save the charts as PDF')}>
          <Printer size={15} /> PDF
        </button>
        <ExportMenu month={month} />
      </div>

      {isEmpty && (
        <div className="notice row wrap no-print" style={{ marginBottom: 20 }}>
          <span>{t('No data yet. Add employees and leads, or import an Excel sheet.')}</span>
          <span className="spacer" />
          {demoAvailable && (
            <button className="btn sm" onClick={actions.loadDemo}>
              <Database size={13} /> {t('Load sample data')}
            </button>
          )}
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: t('Overview'), icon: LayoutDashboard },
          { value: 'employees', label: t('Employees'), icon: Users },
          { value: 'meetings', label: t('Meetings'), icon: CalendarClock },
        ]}
      />

      {tab === 'overview' && (
        <Overview
          month={month}
          onPickEmployee={(id) => {
            setEmployee(id);
            setTab('employees');
          }}
        />
      )}
      {tab === 'employees' && <EmployeesTab month={month} selected={employee} onSelect={setEmployee} />}
      {tab === 'meetings' && <MeetingsList monthKey={month} allowAgentFilter />}
    </>
  );
}

const REP_METRICS = [
  { key: 'calls', label: 'Calls', unit: 'calls', sub: (r) => t('{n} answered', { n: r.answeredCalls }) },
  { key: 'followUps', label: 'Follow-ups', unit: 'follow-ups', sub: (r) => t('{n} WA messages', { n: r.messages }) },
  { key: 'meetingsDone', label: 'Meetings done', unit: 'meetings', sub: (r) => t('{n} planned', { n: r.meetingsScheduled }) },
  { key: 'interestedAll', label: 'Interested leads', unit: 'interested', sub: (r) => t('{n} very interested', { n: r.very_interested }) },
  { key: 'registered', label: 'Registrations', unit: 'registered', sub: (r) => t('{n} new leads', { n: r.newLeads }) },
];

function TopReps({ board, onPick }) {
  const [metric, setMetric] = useState('calls');
  const def = REP_METRICS.find((x) => x.key === metric);
  const ranked = [...board].sort((a, b) => b[metric] - a[metric]);
  const max = Math.max(1, ...ranked.map((r) => r[metric]));
  return (
    <div className="card">
      <div className="card-head">
        <h3>{t('Top performing reps')}</h3>
        <select className="chip-select no-print" value={metric} onChange={(e) => setMetric(e.target.value)}>
          {REP_METRICS.map((x) => (
            <option key={x.key} value={x.key}>{t(x.label)}</option>
          ))}
        </select>
      </div>
      <div className="card-body" style={{ paddingTop: 6 }}>
        {ranked.length === 0 ? (
          <Empty icon={Users} title={t('No employees yet')}>{t('Add call center employees first.')}</Empty>
        ) : (
          <div className="reps">
            {ranked.slice(0, 6).map((r, i) => (
              <div className="rep" key={r.user.id} onClick={() => onPick(r.user.id)}>
                <div className={`rank ${i < 3 && r[metric] > 0 ? 'r' + (i + 1) : ''}`}>{i + 1}</div>
                <Avatar name={r.user.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rep-name">{r.user.name}</div>
                  <div className="rep-bar"><i style={{ width: `${(r[metric] / max) * 100}%` }} /></div>
                </div>
                <div className="rep-val num">
                  <b>{r[metric]} <span style={{ fontWeight: 500 }}>{t(def.unit)}</span></b>
                  <span>{def.sub(r)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ month, onPickEmployee }) {
  const { state } = useStore();
  const { stages } = useLookups();

  const { m, prev, trend, pipeline, board } = useMemo(
    () => ({
      m: computeMonth(state, month),
      prev: computeMonth(state, shiftMonth(month, -1)),
      trend: withInterestedAll(computeTrend(state, month, 6)),
      pipeline: pipelineCounts(state, stages),
      board: withInterestedAll(computeLeaderboard(state, month)).sort((a, b) => b.calls + b.followUps - (a.calls + a.followUps)),
    }),
    [state, month, stages],
  );

  const cols = [
    ['newLeads', 'New leads'],
    ['calls', 'Calls'],
    ['answeredCalls', 'Answered'],
    ['messages', 'WA msgs'],
    ['followUps', 'Follow-ups'],
    ['meetingsDone', 'Meetings done'],
    ['meetingsScheduled', 'Planned'],
    ['interested', 'Interested'],
    ['very_interested', 'Very int.'],
    ['not_interested', 'Not int.'],
    ['registered', 'Registered'],
  ];
  const max = Object.fromEntries(cols.map(([k]) => [k, Math.max(0, ...board.map((r) => r[k]))]));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <KpiGrid m={m} prev={prev} />
      <ActivityHero m={m} prev={prev} monthKey={month} title="Team activity overview" />

      <div className="grid-main">
        <div className="card">
          <div className="card-head"><h3>{t('Lead funnel')}</h3><span className="small muted">{monthLabel(month)}</span></div>
          <div className="card-body"><Funnel steps={funnelSteps(m)} /></div>
        </div>
        <TopReps board={board} onPick={onPickEmployee} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>{t('Interest & registrations')}</h3><span className="small muted">{t('last 6 months')}</span></div>
          <div className="card-body"><LinesChart data={trend} xKey="month" series={TREND_SERIES} /></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Outcomes this month')}</h3></div>
          <div className="card-body">
            <HBarChart data={OUTCOMES.map((o) => ({ name: o.label, value: m[o.key] }))} height={280} />
          </div>
        </div>
      </div>

      <div className="grid-main">
        <div className="card">
          <div className="card-head">
            <h3><Trophy size={15} style={{ verticalAlign: -2, color: '#c98500' }} /> {t('Employee leaderboard')}</h3>
            <span className="small muted">{t('Highest in purple · click a row')}</span>
          </div>
          <div className="card-body" style={{ padding: '12px 0 0' }}>
            {board.length === 0 ? (
              <Empty icon={Users} title={t('No call center employees yet')}>{t('Add them under Employees.')}</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Employee')}</th>
                      {cols.map(([k, label]) => (
                        <th key={k} style={{ textAlign: 'end' }}>{t(label)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((r) => (
                      <tr key={r.user.id} className="clickable" onClick={() => onPickEmployee(r.user.id)}>
                        <td>
                          <span className="row">
                            <Avatar name={r.user.name} sm /> <b style={{ fontWeight: 600 }}>{r.user.name}</b>
                            {!r.user.active && <span className="badge">{t('inactive')}</span>}
                          </span>
                        </td>
                        {cols.map(([k]) => (
                          <td key={k} className={`num ${r[k] > 0 && r[k] === max[k] ? 'best' : ''}`} style={{ textAlign: 'end' }}>
                            {r[k]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Current pipeline')}</h3><span className="small muted">{t('all leads, today')}</span></div>
          <div className="card-body"><HBarChart data={pipeline} /></div>
        </div>
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        {t("How it's counted: outcomes (interested, registered, …) = leads moved into that status during the month. Calls, messages and follow-ups = activities logged in the month. Meetings = meetings dated in the month.")}
      </p>
    </div>
  );
}

function EmployeesTab({ month, selected, onSelect }) {
  const { agents } = useLookups();
  const id = selected && agents.some((a) => a.id === selected) ? selected : agents[0]?.id;
  if (!agents.length)
    return (
      <div className="card">
        <Empty icon={Users} title={t('No call center employees yet')}>{t('Add them from the Employees page.')}</Empty>
      </div>
    );
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row wrap no-print">
        {agents.map((a) => (
          <button key={a.id} className={`btn ${a.id === id ? 'soft' : 'ghost'}`} onClick={() => onSelect(a.id)}>
            <Avatar name={a.name} sm /> {a.name}
          </button>
        ))}
      </div>
      <EmployeeReport userId={id} monthKey={month} />
    </div>
  );
}

/** Export dropdown: month report, all pipelines, or everything. */
function ExportMenu({ month }) {
  const { state } = useStore();
  const lookups = useLookups();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = (fn) => {
    setOpen(false);
    setBusy(true);
    // let the button show "Preparing…" before the (synchronous) export work
    setTimeout(() => {
      try {
        fn();
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const items = [
    {
      icon: FileSpreadsheet,
      title: t('{month} report', { month: monthLabel(month) }),
      text: t('Summary, employees, daily activity, pipeline, meetings and new leads of this month.'),
      run: () => exportMonthReport(state, month, lookups),
    },
    {
      icon: KanbanSquare,
      title: t('All pipelines'),
      text: t('Every lead by status, with a sheet for each employee.'),
      run: () => exportPipeline(state.leads, { owner: null, customColumns: state.customColumns }, lookups),
    },
    {
      icon: Database,
      title: t('All data (everything)'),
      text: t('All leads, full call & activity log, meetings, employees, statuses and month-by-month statistics.'),
      run: () => exportAllData(state, lookups),
    },
  ];

  return (
    <div ref={ref} className="no-print" style={{ position: 'relative' }}>
      <button className="btn primary" disabled={busy} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Download size={15} /> {t(busy ? 'Preparing…' : 'Export')} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dropdown" style={{ width: 340 }}>
          <div className="dd-head">{t('Export to Excel')}</div>
          {items.map((it) => (
            <button key={it.title} className="dd-item" style={{ alignItems: 'flex-start' }} onClick={() => run(it.run)}>
              <div className="tl-icon" style={{ width: 32, height: 32 }}>
                <it.icon size={15} />
              </div>
              <div>
                <div style={{ fontWeight: 650 }}>{it.title}</div>
                <div className="small muted" style={{ whiteSpace: 'normal' }}>{it.text}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
