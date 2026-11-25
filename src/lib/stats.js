import { ACTIVITY_TYPES } from '../store/defaults';
import { daysInMonth, inRange, monthLabel, monthRange, shiftMonth } from './utils';

/*
  How the numbers are counted for a month:
  - New leads:            leads created in the month (by lead owner)
  - Interested / Very interested / Not interested / Registered / Blocked:
                          distinct leads that were MOVED INTO a stage of that kind
                          during the month (by lead owner)
  - Calls / Messages / Follow-ups: activities logged in the month (by who logged them)
  - Meetings:             meetings whose date is in the month (by assigned employee)
*/

export const OUTCOMES = [
  { key: 'interested', label: 'Interested' },
  { key: 'very_interested', label: 'Very interested' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'registered', label: 'Registered' },
  { key: 'blocked', label: 'Blocked us' },
];

export function computeMonth(state, key, { userId } = {}) {
  const range = monthRange(key);
  const leadOwner = new Map(state.leads.map((l) => [l.id, l.ownerId]));
  const byOwner = (leadId) => !userId || leadOwner.get(leadId) === userId;

  const r = {
    newLeads: 0,
    interested: 0,
    very_interested: 0,
    not_interested: 0,
    registered: 0,
    blocked: 0,
    calls: 0,
    calls3cx: 0,
    callsWhatsapp: 0,
    answeredCalls: 0,
    messages: 0,
    followUps: 0,
    contacts: 0,
    contactedLeads: 0,
    meetingsTotal: 0,
    meetingsDone: 0,
    meetingsScheduled: 0,
    meetingsCancelled: 0,
  };

  for (const l of state.leads) {
    if ((!userId || l.ownerId === userId) && inRange(l.createdAt, range)) r.newLeads++;
  }

  const n = daysInMonth(key);
  const daily = Array.from({ length: n }, (_, i) => ({ day: i + 1, contacts: 0, calls: 0, messages: 0, followUps: 0 }));
  const outcomeSets = Object.fromEntries(OUTCOMES.map((o) => [o.key, new Set()]));
  const contacted = new Set();

  for (const a of state.activities) {
    if (!inRange(a.at, range)) continue;
    if (a.type === 'stage_change') {
      if (byOwner(a.leadId) && outcomeSets[a.meta?.toKind]) outcomeSets[a.meta.toKind].add(a.leadId);
      continue;
    }
    if (userId && a.userId !== userId) continue;
    const def = ACTIVITY_TYPES[a.type];
    if (!def?.contact) continue;
    const d = daily[new Date(a.at).getDate() - 1];
    r.contacts++;
    d.contacts++;
    contacted.add(a.leadId);
    if (def.isCall) {
      r.calls++;
      d.calls++;
      if (a.type === 'call_3cx') r.calls3cx++;
      else r.callsWhatsapp++;
      if (a.meta?.answered) r.answeredCalls++;
    } else if (a.type === 'message_whatsapp') {
      r.messages++;
      d.messages++;
    } else if (a.type === 'follow_up') {
      r.followUps++;
      d.followUps++;
    }
  }
  for (const o of OUTCOMES) r[o.key] = outcomeSets[o.key].size;
  r.contactedLeads = contacted.size;

  for (const m of state.meetings) {
    if (userId && m.agentId !== userId) continue;
    if (!inRange(m.scheduledAt, range)) continue;
    r.meetingsTotal++;
    if (m.status === 'done') r.meetingsDone++;
    else if (m.status === 'cancelled') r.meetingsCancelled++;
    else r.meetingsScheduled++;
  }

  r.daily = daily;
  return r;
}

export function computeTrend(state, key, months = 6, opts) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const k = shiftMonth(key, -i);
    const m = computeMonth(state, k, opts);
    out.push({ month: monthLabel(k, true), key: k, ...m });
  }
  return out;
}

export function computeLeaderboard(state, key) {
  return state.users
    .filter((u) => u.role === 'agent')
    .map((u) => ({ user: u, ...computeMonth(state, key, { userId: u.id }) }));
}

export function pipelineCounts(state, stages, { userId } = {}) {
  const counts = new Map(stages.map((s) => [s.id, 0]));
  for (const l of state.leads) {
    if (userId && l.ownerId !== userId) continue;
    if (counts.has(l.stageId)) counts.set(l.stageId, counts.get(l.stageId) + 1);
  }
  return stages.map((s) => ({ name: s.name, value: counts.get(s.id) }));
}

/** Leader in a metric, or null when nobody has any. */
export function topBy(board, metric) {
  let best = null;
  for (const row of board) if (row[metric] > 0 && (!best || row[metric] > best[metric])) best = row;
  return best;
}
