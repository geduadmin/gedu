/*
  Sync between the in-memory state and the server.

  - diffState(prev, next): the actions update state immutably, so a record whose object
    reference changed was edited. Produces put/del operations for /api/sync.
  - applyDocs(state, docs, leadIds): merges records received from /api/data.
    The same record objects are merged into both the "last synced" copy and the live state,
    so they never show up as local changes.
*/
import { api } from '../lib/api';
import { SCHEMA_VERSION } from './defaults';

const COLLECTIONS = [
  ['stages', 'stage'],
  ['leads', 'lead'],
  ['meetings', 'meeting'],
  ['activities', 'activity'],
];
const KIND_TO_COLLECTION = Object.fromEntries(COLLECTIONS.map(([c, k]) => [k, c]));
const SETTINGS = ['customColumns', 'certificateStages'];

export function emptyRemoteState(users = []) {
  return {
    version: SCHEMA_VERSION,
    remote: true,
    // markers so local-only migrations never run on server data
    demoSeeded: true,
    teamV1: true,
    onlyTeamV2: true,
    users,
    stages: [],
    customColumns: [],
    certificateStages: [],
    leads: [],
    activities: [],
    meetings: [],
  };
}

export function diffState(prev, next) {
  const settings = [];
  const puts = [];
  const dels = [];
  for (const key of SETTINGS) {
    if (prev[key] !== next[key]) settings.push({ kind: 'setting', op: 'put', id: key, data: { value: next[key] } });
  }
  for (const [coll, kind] of COLLECTIONS) {
    if (prev[coll] === next[coll]) continue;
    const before = new Map(prev[coll].map((x) => [x.id, x]));
    const seen = new Set();
    for (const x of next[coll]) {
      seen.add(x.id);
      if (before.get(x.id) !== x) puts.push({ kind, op: 'put', id: x.id, data: x });
    }
    for (const id of before.keys()) if (!seen.has(id)) dels.push({ kind, op: 'del', id });
  }
  // parents before children when adding, children before parents when deleting
  dels.reverse();
  return [...settings, ...puts, ...dels];
}

export function applyDocs(state, docs, leadIds) {
  const next = { ...state };
  const maps = {};
  for (const d of docs) {
    if (d.kind === 'setting') {
      if (!d.deleted && d.data && SETTINGS.includes(d.id)) next[d.id] = d.data.value;
      continue;
    }
    const coll = KIND_TO_COLLECTION[d.kind];
    if (!coll) continue;
    maps[coll] ??= new Map(next[coll].map((x) => [x.id, x]));
    if (d.deleted) maps[coll].delete(d.id);
    else maps[coll].set(d.id, d.data);
  }
  for (const [coll, map] of Object.entries(maps)) next[coll] = [...map.values()];

  if (leadIds) {
    // employee view: drop leads that are no longer hers (reassigned / deleted)
    const keep = new Set(leadIds);
    if (next.leads.some((l) => !keep.has(l.id))) {
      next.leads = next.leads.filter((l) => keep.has(l.id));
      next.activities = next.activities.filter((a) => keep.has(a.leadId));
      next.meetings = next.meetings.filter((m) => keep.has(m.leadId));
    }
  }
  return next;
}

/** Fetch every page of changes after `cursor` (all data when cursor is empty). */
export async function fetchChanges(cursor, overlapSeconds = 0) {
  const docs = [];
  let extras = null;
  let cur = cursor || '';
  let first = true;
  for (;;) {
    const qs = new URLSearchParams();
    if (cur) qs.set('cursor', cur);
    if (first && overlapSeconds && cur) qs.set('overlap', String(overlapSeconds));
    if (!first) qs.set('page', '2');
    const res = await api(`data?${qs}`);
    if (first) extras = { users: res.users, me: res.me, leadIds: res.leadIds };
    docs.push(...res.docs);
    cur = res.cursor;
    first = false;
    if (!res.more) break;
  }
  return { docs, cursor: cur, ...extras };
}

/**
 * Collapse repeated changes to the same record: keep its FIRST position (so a new lead is
 * still sent before its activity) but the LATEST data.
 */
export function compactOps(ops) {
  const pos = new Map();
  const out = [];
  for (const o of ops) {
    const k = `${o.kind}:${o.id}`;
    if (pos.has(k)) out[pos.get(k)] = o;
    else {
      pos.set(k, out.length);
      out.push(o);
    }
  }
  return out;
}
