import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadState, saveState } from '../lib/idb';
import { uid, nowIso } from '../lib/utils';
import { ACTIVITY_TYPES, createInitialState, emptyFlags, migrate } from './defaults';
// Sample-data generator is a LOCAL-ONLY file (git-ignored). When it isn't there — e.g. on
// GitHub / Vercel — the app starts clean and the "Load sample data" buttons are hidden.
const demoModules = import.meta.glob('./demo.local.js');
const loadDemoModule = demoModules['./demo.local.js'];
export const HAS_DEMO = !!loadDemoModule;
const withDemo = async (s) => (HAS_DEMO ? (await loadDemoModule()).withDemoData(s) : s);

const StoreCtx = createContext(null);
const SESSION_KEY = 'lf_session';

/* ---------- pure helpers used inside setState ---------- */

const STAGE_FLAG_SYNC = {
  answered: { answered: true },
  no_answer: { answered: false },
  follow_up: { followingUp: true },
  blocked: { blocked: true },
};

function activity(leadId, userId, type, meta = {}, at = nowIso()) {
  return { id: uid(), leadId, userId, type, at, meta };
}

function stageChange(s, lead, toStageId, by, at = nowIso()) {
  const to = s.stages.find((x) => x.id === toStageId);
  if (!to) return { lead, acts: [] };
  const flags = { ...lead.flags, ...(STAGE_FLAG_SYNC[to.kind] ?? {}) };
  return {
    lead: { ...lead, stageId: toStageId, flags },
    acts: [activity(lead.id, by, 'stage_change', { from: lead.stageId ?? null, to: toStageId, toKind: to.kind }, at)],
  };
}

function buildLead(s, data, by) {
  const firstStage = [...s.stages].sort((a, b) => a.order - b.order)[0];
  const at = data.createdAt || nowIso();
  const lead = {
    id: uid(),
    ownerId: data.ownerId || by,
    name: '',
    email: '',
    phone: '',
    city: '',
    country: '',
    nationality: '',
    gender: '',
    certificateStage: '',
    notes: '',
    files: [],
    custom: {},
    lastContactAt: null,
    ...data,
    createdAt: at,
    stageId: null,
    flags: { ...emptyFlags(), ...data.flags },
    updatedAt: nowIso(),
  };
  const acts = [activity(lead.id, by, 'created', {}, at)];
  const target = data.stageId || firstStage?.id;
  const sc = stageChange(s, lead, target, by, at);
  return { lead: sc.lead, acts: [...acts, ...sc.acts] };
}

/* ---------- provider ---------- */

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const ready = useRef(false);

  useEffect(() => {
    loadState()
      .then(async (s) => {
        // First run (or an untouched install): sample data, only where the local demo file exists.
        if (!s) return setState(await withDemo(createInitialState()));
        const m = migrate(s);
        const pristine = !s.demoSeeded && m.leads.length === 0;
        setState(pristine ? await withDemo(m) : m);
      })
      .catch((e) => {
        console.error(e);
        setLoadError(String(e));
        setState(createInitialState());
      });
  }, []);

  useEffect(() => {
    if (!state) return;
    if (!ready.current) {
      ready.current = true;
      if (loadError) return; // don't overwrite storage we failed to read
    }
    saveState(state).catch((e) => console.error('Save failed', e));
  }, [state, loadError]);

  const user = useMemo(
    () => state?.users.find((u) => u.id === sessionId && u.active) ?? null,
    [state, sessionId],
  );

  const actions = useMemo(() => {
    const update = (fn) => setState((s) => fn(s));
    const me = () => sessionId;

    return {
      /* auth */
      login(email, password) {
        const u = state.users.find((x) => x.email.trim().toLowerCase() === email.trim().toLowerCase());
        if (!u || u.password !== password) return 'Wrong email or password';
        if (!u.active) return 'This account is deactivated';
        localStorage.setItem(SESSION_KEY, u.id);
        setSessionId(u.id);
        return null;
      },
      logout() {
        localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
      },

      /* users */
      addUser(data) {
        const id = uid();
        update((s) => ({ ...s, users: [...s.users, { active: true, role: 'agent', phone: '', ...data, id, createdAt: nowIso() }] }));
        return id;
      },
      updateUser(id, patch) {
        update((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
      },
      deleteUser(id) {
        update((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
      },
      reassignLeads(fromId, toId) {
        update((s) => ({
          ...s,
          leads: s.leads.map((l) => (l.ownerId === fromId ? { ...l, ownerId: toId, updatedAt: nowIso() } : l)),
          meetings: s.meetings.map((m) => (m.agentId === fromId && m.status === 'scheduled' ? { ...m, agentId: toId } : m)),
        }));
      },

      /* leads */
      addLead(data) {
        const id = uid();
        update((s) => {
          const { lead, acts } = buildLead(s, { ...data, id }, me());
          return { ...s, leads: [lead, ...s.leads], activities: [...s.activities, ...acts] };
        });
        return id;
      },
      importLeads(list) {
        update((s) => {
          const leads = [];
          const acts = [];
          for (const data of list) {
            const r = buildLead(s, data, me());
            leads.push(r.lead);
            acts.push(...r.acts);
          }
          return { ...s, leads: [...leads, ...s.leads], activities: [...s.activities, ...acts] };
        });
      },
      updateLead(id, patch) {
        update((s) => {
          let acts = [];
          const leads = s.leads.map((l) => {
            if (l.id !== id) return l;
            let next = { ...l, ...patch, stageId: l.stageId, updatedAt: nowIso() };
            if (patch.stageId && patch.stageId !== l.stageId) {
              const sc = stageChange(s, next, patch.stageId, me());
              next = sc.lead;
              acts = sc.acts;
            }
            return next;
          });
          return { ...s, leads, activities: [...s.activities, ...acts] };
        });
      },
      bulkUpdateLeads(ids, patch) {
        const set = new Set(ids);
        update((s) => {
          const acts = [];
          const leads = s.leads.map((l) => {
            if (!set.has(l.id)) return l;
            let next = { ...l, ...patch, stageId: l.stageId, updatedAt: nowIso() };
            if (patch.stageId && patch.stageId !== l.stageId) {
              const sc = stageChange(s, next, patch.stageId, me());
              next = sc.lead;
              acts.push(...sc.acts);
            }
            return next;
          });
          return { ...s, leads, activities: [...s.activities, ...acts] };
        });
      },
      deleteLeads(ids) {
        const set = new Set(ids);
        update((s) => ({
          ...s,
          leads: s.leads.filter((l) => !set.has(l.id)),
          activities: s.activities.filter((a) => !set.has(a.leadId)),
          meetings: s.meetings.filter((m) => !set.has(m.leadId)),
        }));
      },
      logActivity(leadId, type, { text = '', answered } = {}) {
        const def = ACTIVITY_TYPES[type];
        const at = nowIso();
        update((s) => ({
          ...s,
          leads: s.leads.map((l) => {
            if (l.id !== leadId) return l;
            const flags = { ...l.flags };
            if (def?.flag) flags[def.flag] = true;
            if (def?.isCall && answered !== undefined) flags.answered = answered || flags.answered;
            return { ...l, flags, lastContactAt: def?.contact ? at : l.lastContactAt, updatedAt: at };
          }),
          activities: [...s.activities, activity(leadId, me(), type, { text, ...(answered !== undefined ? { answered } : {}) }, at)],
        }));
      },
      deleteActivity(id) {
        update((s) => ({ ...s, activities: s.activities.filter((a) => a.id !== id) }));
      },
      addFile(leadId, file) {
        update((s) => ({
          ...s,
          leads: s.leads.map((l) => (l.id === leadId ? { ...l, files: [...l.files, { id: uid(), uploadedAt: nowIso(), ...file }] } : l)),
          activities: [...s.activities, activity(leadId, me(), 'file', { text: `Uploaded ${file.name}` })],
        }));
      },
      removeFile(leadId, fileId) {
        update((s) => ({
          ...s,
          leads: s.leads.map((l) => (l.id === leadId ? { ...l, files: l.files.filter((f) => f.id !== fileId) } : l)),
        }));
      },

      /* meetings */
      addMeeting(data) {
        update((s) => ({
          ...s,
          meetings: [...s.meetings, { status: 'scheduled', notes: '', title: 'Meeting', ...data, id: uid(), createdAt: nowIso() }],
          activities: [...s.activities, activity(data.leadId, me(), 'meeting', { text: `Meeting scheduled: ${data.title || 'Meeting'}` })],
        }));
      },
      updateMeeting(id, patch) {
        update((s) => ({ ...s, meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
      },
      deleteMeeting(id) {
        update((s) => ({ ...s, meetings: s.meetings.filter((m) => m.id !== id) }));
      },

      /* stages */
      addStage(data) {
        update((s) => ({ ...s, stages: [...s.stages, { kind: 'custom', color: '#64748b', ...data, id: uid(), order: s.stages.length }] }));
      },
      updateStage(id, patch) {
        update((s) => ({ ...s, stages: s.stages.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      /** Delete a status column — only when no lead (in any pipeline) is in it. */
      deleteStage(id) {
        update((s) => {
          if (s.stages.length <= 1 || s.leads.some((l) => l.stageId === id)) return s;
          const remaining = s.stages.filter((x) => x.id !== id).sort((a, b) => a.order - b.order);
          return { ...s, stages: remaining.map((x, i) => ({ ...x, order: i })) };
        });
      },
      /** Move a status column to a new position (0-based). */
      reorderStage(id, toIndex) {
        update((s) => {
          const list = [...s.stages].sort((a, b) => a.order - b.order);
          const from = list.findIndex((x) => x.id === id);
          if (from < 0 || from === toIndex) return s;
          const [moved] = list.splice(from, 1);
          list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, moved);
          return { ...s, stages: list.map((x, k) => ({ ...x, order: k })) };
        });
      },
      moveStage(id, dir) {
        update((s) => {
          const list = [...s.stages].sort((a, b) => a.order - b.order);
          const i = list.findIndex((x) => x.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= list.length) return s;
          [list[i], list[j]] = [list[j], list[i]];
          return { ...s, stages: list.map((x, k) => ({ ...x, order: k })) };
        });
      },

      /* custom columns */
      addColumn(data) {
        update((s) => ({ ...s, customColumns: [...s.customColumns, { type: 'text', options: [], ...data, id: data.id ?? uid() }] }));
      },
      updateColumn(id, patch) {
        update((s) => ({ ...s, customColumns: s.customColumns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      },
      deleteColumn(id) {
        update((s) => ({
          ...s,
          customColumns: s.customColumns.filter((c) => c.id !== id),
          leads: s.leads.map((l) => {
            if (!(id in (l.custom ?? {}))) return l;
            const custom = { ...l.custom };
            delete custom[id];
            return { ...l, custom };
          }),
        }));
      },
      setCertificateStages(list) {
        update((s) => ({ ...s, certificateStages: list }));
      },

      /* data management */
      replaceState(next) {
        setState(migrate(next));
      },
      loadDemo() {
        if (!HAS_DEMO) return;
        loadDemoModule().then((mod) => update((s) => mod.withDemoData(s)));
      },
      resetAll() {
        const fresh = { ...createInitialState(), demoSeeded: true }; // stay empty, no auto sample data
        setState(fresh);
        localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
      },
    };
  }, [state, sessionId]);

  const value = useMemo(() => ({ state, user, actions, loadError }), [state, user, actions, loadError]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);

/* convenience selectors */
export function useLookups() {
  const { state } = useStore();
  return useMemo(() => {
    const stages = [...state.stages].sort((a, b) => a.order - b.order);
    return {
      stages,
      stageById: Object.fromEntries(stages.map((s) => [s.id, s])),
      userById: Object.fromEntries(state.users.map((u) => [u.id, u])),
      leadById: Object.fromEntries(state.leads.map((l) => [l.id, l])),
      agents: state.users.filter((u) => u.role === 'agent'),
    };
  }, [state]);
}

/** Leads the current user may see: everything for admins, own leads for agents. */
export function useVisibleLeads() {
  const { state, user } = useStore();
  return useMemo(
    () => (user?.role === 'admin' ? state.leads : state.leads.filter((l) => l.ownerId === user?.id)),
    [state.leads, user],
  );
}
