import { useMemo, useState } from 'react';
import { CalendarCheck, GraduationCap, MessageCircle, PhoneCall, Repeat, Star, ThumbsDown, ThumbsUp, UserPlus } from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import { computeMonth, computeTrend, OUTCOMES, pipelineCounts } from '../lib/stats';
import { monthLabel, shiftMonth } from '../lib/utils';
import { AreaHero, Funnel, HBarChart, LinesChart } from './charts';
import { Avatar, Delta, Kpi, Stat } from './ui';
import MeetingsList from './MeetingsList';
import { locale, t } from '../i18n';

export const TREND_SERIES = [
  { key: 'interestedAll', label: 'Interested (incl. very)' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'registered', label: 'Registered' },
];

export const ACTIVITY_METRICS = [
  { key: 'contacts', label: 'All contacts' },
  { key: 'calls', label: 'Calls' },
  { key: 'followUps', label: 'Follow-ups' },
  { key: 'messages', label: 'WhatsApp messages' },
];

/** Short day label (e.g. "5 Mar") in the current language. */
const dayLabel = (monthKey, d) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
};

export const withInterestedAll = (rows) => rows.map((r) => ({ ...r, interestedAll: r.interested + r.very_interested }));

export function KpiGrid({ m, prev }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="kpis">
        <Kpi label={t('New leads')} icon={UserPlus} tone="indigo" value={m.newLeads} prev={prev?.newLeads} />
        <Kpi label={t('Interested')} icon={ThumbsUp} tone="green" value={m.interested + m.very_interested} prev={prev && prev.interested + prev.very_interested} />
        <Kpi label={t('Registered at university')} icon={GraduationCap} tone="purple" value={m.registered} prev={prev?.registered} />
        <Kpi label={t('Calls made')} icon={PhoneCall} tone="orange" value={m.calls} prev={prev?.calls} />
      </div>
      <div className="card stat-strip">
        <Stat label={t('Very interested')} icon={Star} tone="amber" value={m.very_interested} />
        <Stat label={t('Not interested')} icon={ThumbsDown} tone="red" value={m.not_interested} />
        <Stat label={t('Follow-ups')} icon={Repeat} tone="blue" value={m.followUps} />
        <Stat label={t('WhatsApp messages')} icon={MessageCircle} tone="teal" value={m.messages} />
        <Stat label={t('Meetings done')} icon={CalendarCheck} tone="pink" value={m.meetingsDone} />
      </div>
    </div>
  );
}

export function funnelSteps(m) {
  return [
    { label: 'Leads contacted', value: m.contactedLeads, hint: 'Reached this month' },
    { label: 'Interested', value: m.interested + m.very_interested },
    { label: 'Meetings', value: m.meetingsTotal },
    { label: 'Registered', value: m.registered },
  ];
}

/** Hero area chart with metric switcher, total and change vs last month. */
export function ActivityHero({ m, prev, monthKey, title = 'Activity overview' }) {
  const [metric, setMetric] = useState('contacts');
  const def = ACTIVITY_METRICS.find((x) => x.key === metric);
  const total = m[metric];
  return (
    <div className="card">
      <div className="card-head">
        <h3>{t(title)}</h3>
        <select className="chip-select no-print" value={metric} onChange={(e) => setMetric(e.target.value)}>
          {ACTIVITY_METRICS.map((x) => (
            <option key={x.key} value={x.key}>{t(x.label)}</option>
          ))}
        </select>
      </div>
      <div className="card-body">
        <div className="hero-label">{t('{what} in {month}', { what: t(def.label), month: monthLabel(monthKey) })}</div>
        <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
          <div className="hero-value num">{total.toLocaleString()}</div>
          <Delta value={total} prev={prev[metric]} suffix={t('vs {month}', { month: monthLabel(shiftMonth(monthKey, -1), true) })} />
        </div>
        <AreaHero
          data={m.daily}
          xKey="day"
          yKey={metric}
          name={t(def.label)}
          tickFormatter={(d) => dayLabel(monthKey, d)}
          labelFormatter={(d) => dayLabel(monthKey, d)}
        />
      </div>
    </div>
  );
}

/** One employee's month: KPIs, activity, funnel, outcomes, pipeline, trend, meetings. */
export default function EmployeeReport({ userId, monthKey }) {
  const { state } = useStore();
  const { stages, userById } = useLookups();
  const u = userById[userId];

  const { m, prev, trend, pipeline } = useMemo(
    () => ({
      m: computeMonth(state, monthKey, { userId }),
      prev: computeMonth(state, shiftMonth(monthKey, -1), { userId }),
      trend: withInterestedAll(computeTrend(state, monthKey, 6, { userId })),
      pipeline: pipelineCounts(state, stages, { userId }),
    }),
    [state, monthKey, userId, stages],
  );
  if (!u) return null;
  const totalLeads = state.leads.filter((l) => l.ownerId === userId).length;
  const answerRate = m.calls ? Math.round((m.answeredCalls / m.calls) * 100) : 0;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card card-pad row wrap" style={{ gap: 16 }}>
        <Avatar name={u.name} lg />
        <div>
          <h2>{u.name}</h2>
          <div className="small ink2">
            <bdi dir="ltr">{u.email}</bdi> {u.phone && <>· <bdi dir="ltr">{u.phone}</bdi></>}
          </div>
        </div>
        <div className="spacer" />
        <div className="row wrap" style={{ gap: 28 }}>
          {[
            ['Total leads', totalLeads],
            ['3CX / WhatsApp calls', `${m.calls3cx} / ${m.callsWhatsapp}`],
            ['Answer rate', `${answerRate}%`],
            ['Meetings planned', m.meetingsScheduled],
            ['Blocked us', m.blocked],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="small ink2">{t(k)}</div>
              <b className="num" style={{ fontSize: 20 }}>{v}</b>
            </div>
          ))}
        </div>
      </div>

      <KpiGrid m={m} prev={prev} />
      <ActivityHero m={m} prev={prev} monthKey={monthKey} title="Daily activity" />

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>{t('Lead funnel')}</h3><span className="small muted">{monthLabel(monthKey)}</span></div>
          <div className="card-body"><Funnel steps={funnelSteps(m)} /></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Outcomes this month')}</h3></div>
          <div className="card-body">
            <HBarChart data={OUTCOMES.map((o) => ({ name: o.label, value: m[o.key] }))} height={290} />
          </div>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>{t('Last 6 months')}</h3></div>
          <div className="card-body"><LinesChart data={trend} xKey="month" series={TREND_SERIES} /></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('Current pipeline')}</h3><span className="small muted">{t('today')}</span></div>
          <div className="card-body"><HBarChart data={pipeline} /></div>
        </div>
      </div>

      <div className="section-title">{t('Meetings in {month}', { month: monthLabel(monthKey) })}</div>
      <MeetingsList monthKey={monthKey} agentId={userId} />
    </div>
  );
}

