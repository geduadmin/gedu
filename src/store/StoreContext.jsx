import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadState, saveState } from '../lib/idb';
import { api, checkHealth } from '../lib/api';
import { applyDocs, compactOps, diffState, emptyRemoteState, fetchChanges } from './remote';
import { nowIso, readFileAsDataUrl, uid } from '../lib/utils';
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

const LOCAL_MAX_FILE = 10 * 1024 * 1024;
const REMOTE_MAX_FILE = 4 * 1024 * 1024; // Vercel Functions accept up to 4.5 MB per request
const SYNC_CHUNK = 300;
const POLL_MS = 15000;

/** Link to download a lead file (server file, or old in-browser file). */
export const fileHref = (f) =>
  f.path ? `/api/files?path=${encodeURIComponent(f.path)}&name=${encodeURIComponent(f.name)}` : f.dataUrl;

export function StoreProvider({ children }) {
  const [mode, setMode] = useState(null); // 'local' (this browser only) | 'remote' (server database)
  const [health, setHealth] = useState(null);
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY)); // local mode
  const [meId, setMeId] = useState(null); // remote mode
  const [syncStatus, setSyncStatus] = useState('saved'); // saved | saving | error
  const [syncError, setSyncError] = useState('');
  const ready = useRef(false);
  // remote sync bookkeeping: last state known to match the server, unsent changes, data cursor
  const remote = useRef({ synced: null, queue: [], flushing: false, cursor: '', retry: null, version: 0 });

  /* ----- remote helpers (only use refs and state setters, so they are safe in effects) ----- */
  const signedOut = () => {
    const r = remote.current;
    r.synced = null;
    r.queue = [];
    r.cursor = '';
    setMeId(null);
    setState(emptyRemoteState());
  };

  const loadRemote = async () => {
    try {
      const res = await fetchChanges('', 0);
      const st = applyDocs(emptyRemoteState(res.users), res.docs, res.leadIds);
      const r = remote.current;
      r.synced = st;
      r.cursor = res.cursor;
      r.queue = [];
      setMeId(res.me.id);
      setState(st);
      setSyncStatus('saved');
      setSyncError('');
      setLoadError(null);
    } catch (e) {
      if (e.status === 401) signedOut();
      else {
        setLoadError(e.message);
        setState((s) => s ?? emptyRemoteState());
      }
    }
  };

  const flush = async () => {
    const r = remote.current;
    if (r.flushing) return;
    r.flushing = true;
    clearTimeout(r.retry);
    setSyncStatus('saving');
    try {
      while (r.queue.length) {
        r.queue = compactOps(r.queue);
        const chunk = r.queue.slice(0, SYNC_CHUNK);
        try {
          await api('sync', { method: 'POST', body: { ops: chunk } });
          r.queue = r.queue.slice(chunk.length);
        } catch (e) {
          if (e.status === 401) {
            signedOut();
            return;
          }
          if (e.status >= 400 && e.status < 500) {
            // The server refused the change: show the error and reload the real data.
            r.queue = [];
            setSyncStatus('error');
            setSyncError(e.message);
            r.flushing = false;
            await loadRemote();
            setSyncStatus('error');
            setSyncError(`${e.message} The change was not saved.`);
            return;
          }
          // network / server problem: keep the changes and retry
          setSyncStatus('error');
          setSyncError(`${e.message}. Retrying…`);
          r.retry = setTimeout(() => flush(), 5000);
          return;
        }
      }
      setSyncStatus('saved');
      setSyncError('');
    } finally {
      r.flushing = false;
    }
  };

  /* ----- startup: server database if the API is configured, otherwise this browser ----- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await checkHealth();
      if (cancelled) return;
      const useRemote = import.meta.env.PROD || !!h?.db;
      setHealth(h);
      setMode(useRemote ? 'remote' : 'local');
      if (useRemote) {
        if (!h?.db || !h?.session) return setState(emptyRemoteState()); // setup screen explains what's missing
        await loadRemote();
        return;
      }
      try {
        const s = await loadState();
        // First run (or an untouched install): sample data, only where the local demo file exists.
        if (!s) return setState(await withDemo(createInitialState()));
        const m = migrate(s);
        const pristine = !s.demoSeeded && m.leads.length === 0;
        setState(pristine ? await withDemo(m) : m);
      } catch (e) {
        console.error(e);
        setLoadError(String(e));
        setState(createInitialState());
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----- local mode: save the whole state in this browser ----- */
  useEffect(() => {
    if (mode !== 'local' || !state) return;
    if (!ready.current) {
      ready.current = true;
      if (loadError) return; // don't overwrite storage we failed to read
    }
    saveState(state).catch((e) => console.error('Save failed', e));
  }, [state, loadError, mode]);

  /* ----- remote mode: send every local change to the server ----- */
  useEffect(() => {
    const r = remote.current;
    if (mode !== 'remote' || !state || !r.synced || state === r.synced) return;
    const ops = diffState(r.synced, state);
    r.synced = state;
    if (ops.length) {
      r.version++;
      r.queue.push(...ops);
      flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mode]);

  /* ----- remote mode: pick up teammates' changes ----- */
  useEffect(() => {
    if (mode !== 'remote' || !meId) return;
    let stopped = false;
    const tick = async () => {
      const r = remote.current;
      if (stopped || document.hidden || r.flushing || r.queue.length || !r.synced) return;
      const version = r.version;
      try {
        const res = await fetchChanges(r.cursor, 60);
        // skip if something changed locally meanwhile — the next tick re-reads (60 s overlap)
        if (stopped || r.version !== version || r.queue.length || r.flushing || !r.synced) return;
        r.cursor = res.cursor;
        r.synced = { ...applyDocs(r.synced, res.docs, res.leadIds), users: res.users };
        setState((s) => ({ ...applyDocs(s, res.docs, res.leadIds), users: res.users }));
      } catch (e) {
        if (e.status === 401) signedOut();
      }
    };
    const timer = setInterval(tick, POLL_MS);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, meId]);

  // warn before closing the tab with unsaved changes
  useEffect(() => {
    const onLeave = (e) => {
      if (remote.current.queue.length || remote.current.flushing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const user = useMemo(() => {
    if (!state) return null;
    const id = mode === 'remote' ? meId : sessionId;
    return state.users.find((u) => u.id === id && u.active) ?? null;
  }, [state, sessionId, meId, mode]);

  const actions = useMemo(() => {
    const update = (fn) => setState((s) => fn(s));
    const isRemote = mode === 'remote';
    const me = () => (isRemote ? meId : sessionId);
    const maxFileBytes = isRemote ? REMOTE_MAX_FILE : LOCAL_MAX_FILE;
    const addFileMeta = (leadId, file) =>
      update((s) => ({
        ...s,
        leads: s.leads.map((l) => (l.id === leadId ? { ...l, files: [...l.files, { id: uid(), uploadedAt: nowIso(), ...file }] } : l)),
        activities: [...s.activities, activity(leadId, me(), 'file', { text: `Uploaded ${file.name}` })],
      }));

    return {
      maxFileBytes,

      /* auth — return an error message, or null on success */
      async login(email, password) {
        if (isRemote) {
          try {
            await api('auth', { method: 'POST', body: { action: 'login', email, password } });
            await loadRemote();
            return null;
          } catch (e) {
            return e.message;
          }
        }
        const u = state.users.find((x) => x.email.trim().toLowerCase() === email.trim().toLowerCase());
        if (!u || u.password !== password) return 'Wrong email or password';
        if (!u.active) return 'This account is deactivated';
        localStorage.setItem(SESSION_KEY, u.id);
        setSessionId(u.id);
        return null;
      },
      async logout() {
        if (isRemote) {
          if (remote.current.queue.length) await flush();
          await api('auth', { method: 'POST', body: { action: 'logout' } }).catch(() => {});
          signedOut();
          return;
        }
        localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
      },

      /* users — return an error message, or null on success */
      async addUser(data) {
        if (isRemote) {
          try {
            const { user: u } = await api('users', { method: 'POST', body: data });
            update((s) => ({ ...s, users: [...s.users, u] }));
            return null;
          } catch (e) {
            return e.message;
          }
        }
        update((s) => ({ ...s, users: [...s.users, { active: true, role: 'agent', phone: '', ...data, id: uid(), createdAt: nowIso() }] }));
        return null;
      },
      async updateUser(id, patch) {
        if (isRemote) {
          try {
            const { user: u } = await api(`users?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
            update((s) => ({ ...s, users: s.users.map((x) => (x.id === id ? u : x)) }));
            return null;
          } catch (e) {
            return e.message;
          }
        }
        update((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
        return null;
      },
      async deleteUser(id) {
        if (isRemote) {
          try {
            await api(`users?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          } catch (e) {
            return e.message;
          }
        }
        update((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
        return null;
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
      /** Upload a file to a lead. Returns an error message, or null. */
      async uploadFile(leadId, file) {
        if (file.size > maxFileBytes) return `${file.name} is larger than ${maxFileBytes / 1024 / 1024} MB`;
        if (isRemote) {
          try {
            const res = await api(`files?leadId=${encodeURIComponent(leadId)}&name=${encodeURIComponent(file.name)}`, {
              method: 'POST',
              raw: file,
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
            });
            addFileMeta(leadId, { name: file.name, size: file.size, type: file.type, path: res.path });
            return null;
          } catch (e) {
            return `${file.name}: ${e.message}`;
          }
        }
        addFileMeta(leadId, { name: file.name, size: file.size, type: file.type, dataUrl: await readFileAsDataUrl(file) });
        return null;
      },
      /** Remove a file from a lead (and from server storage). Returns an error message, or null. */
      async removeFile(leadId, file) {
        if (isRemote && file.path) {
          try {
            await api(`files?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' });
          } catch (e) {
            if (e.status !== 404) return e.message;
          }
        }
        update((s) => ({
          ...s,
          leads: s.leads.map((l) => (l.id === leadId ? { ...l, files: l.files.filter((f) => f.id !== file.id) } : l)),
        }));
        return null;
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
      /** Personal column order for the signed-in user (employees). Doesn't change anyone else's board. */
      reorderMyColumn(id, toIndex) {
        update((s) => {
          const list = personalStages(s.stages, s.columnOrders?.[me()]).map((x) => x.id);
          const from = list.indexOf(id);
          if (from < 0 || from === toIndex) return s;
          list.splice(from, 1);
          list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, id);
          return { ...s, columnOrders: { ...s.columnOrders, [me()]: list } };
        });
      },
      resetMyColumnOrder() {
        update((s) => (s.columnOrders?.[me()]?.length ? { ...s, columnOrders: { ...s.columnOrders, [me()]: [] } } : s));
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
        if (isRemote) return; // restoring a browser backup over the shared database is not supported
        setState(migrate(next));
      },
      loadDemo() {
        if (!HAS_DEMO || isRemote) return;
        loadDemoModule().then((mod) => update((s) => mod.withDemoData(s)));
      },
      resetAll() {
        if (isRemote) return;
        const fresh = { ...createInitialState(), demoSeeded: true }; // stay empty, no auto sample data
        setState(fresh);
        localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sessionId, meId, mode]);

  const value = useMemo(
    () => ({ state, user, actions, loadError, mode, health, syncStatus, syncError, demoAvailable: HAS_DEMO && mode === 'local' }),
    [state, user, actions, loadError, mode, health, syncStatus, syncError],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);

/** Statuses in the admin's order, rearranged by a personal order (ids) when given. New statuses keep their place at the end. */
export function personalStages(stages, order) {
  const base = [...stages].sort((a, b) => a.order - b.order);
  if (!order?.length) return base;
  const rank = new Map(order.map((id, i) => [id, i]));
  return base
    .map((s, i) => ({ s, k: rank.has(s.id) ? rank.get(s.id) : order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}

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
