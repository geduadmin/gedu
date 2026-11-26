import { uid, nowIso } from '../lib/utils';

export const SCHEMA_VERSION = 1;

/* Stage "kind" drives statistics. Custom stages use kind "custom". */
export const STAGE_KINDS = [
  { value: 'new', label: 'New' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'answered', label: 'Answered' },
  { value: 'follow_up', label: 'Following up' },
  { value: 'interested', label: 'Interested' },
  { value: 'very_interested', label: 'Very interested' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'registered', label: 'Registered' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'blocked', label: 'Blocked us' },
  { value: 'custom', label: 'Custom (no stats)' },
];

export const DEFAULT_STAGES = [
  ['New Lead', 'new', '#64748b'],
  ['No Answer', 'no_answer', '#a16207'],
  ['Answered', 'answered', '#0891b2'],
  ['Following Up', 'follow_up', '#7c3aed'],
  ['Interested', 'interested', '#2563eb'],
  ['Very Interested', 'very_interested', '#1d4ed8'],
  ['Meeting Scheduled', 'meeting', '#c026d3'],
  ['Registered', 'registered', '#15803d'],
  ['Not Interested', 'not_interested', '#b45309'],
  ['Blocked Us', 'blocked', '#b91c1c'],
];

export const DEFAULT_CERTIFICATES = [
  'High School',
  'Diploma',
  "Bachelor's",
  "Master's",
  'PhD',
  'Other',
];

export const GENDERS = ['Male', 'Female'];

export const FLAGS = [
  { key: 'whatsappCall', label: 'Called on WhatsApp' },
  { key: 'whatsappMessage', label: 'Messaged on WhatsApp' },
  { key: 'call3cx', label: 'Called on 3CX' },
  { key: 'answered', label: 'Answered' },
  { key: 'followingUp', label: 'Following up' },
  { key: 'blocked', label: 'Blocked us' },
];

export const ACTIVITY_TYPES = {
  created: { label: 'Lead created' },
  stage_change: { label: 'Stage changed' },
  call_3cx: { label: '3CX call', contact: true, flag: 'call3cx', isCall: true },
  call_whatsapp: { label: 'WhatsApp call', contact: true, flag: 'whatsappCall', isCall: true },
  message_whatsapp: { label: 'WhatsApp message', contact: true, flag: 'whatsappMessage' },
  follow_up: { label: 'Follow-up', contact: true, flag: 'followingUp' },
  note: { label: 'Note' },
  meeting: { label: 'Meeting' },
  file: { label: 'File' },
};

export const LOGGABLE_ACTIVITIES = ['call_3cx', 'call_whatsapp', 'message_whatsapp', 'follow_up', 'note'];

export const emptyFlags = () => ({
  whatsappCall: false,
  whatsappMessage: false,
  call3cx: false,
  answered: false,
  followingUp: false,
  blocked: false,
});

/* Team members added on request. Created once (also in existing saved data);
   if an admin later deletes one, they are not re-created. */
export const TEAM_EMPLOYEES = [
  { name: 'Rasha', email: 'rasha@leadflow.demo' },
  { name: 'Entesar', email: 'entesar@leadflow.demo' },
];
const TEAM_FLAG = 'teamV1';

const makeEmployee = ({ name, email }) => ({
  id: uid(),
  name,
  email,
  phone: '',
  password: '123456',
  role: 'agent',
  active: true,
  createdAt: nowIso(),
});

function ensureTeam(users) {
  const have = new Set(users.map((u) => u.email.toLowerCase()));
  return [...users, ...TEAM_EMPLOYEES.filter((e) => !have.has(e.email)).map(makeEmployee)];
}

export function createInitialState() {
  return {
    version: SCHEMA_VERSION,
    users: [
      {
        id: uid(),
        name: 'Sarah Aljani',
        email: 'admin@admin.com',
        phone: '',
        password: 'admin123',
        role: 'admin',
        active: true,
        createdAt: nowIso(),
      },
      ...TEAM_EMPLOYEES.map(makeEmployee),
    ],
    [TEAM_FLAG]: true,
    [ONLY_TEAM_FLAG]: true,
    stages: DEFAULT_STAGES.map(([name, kind, color], i) => ({ id: uid(), name, kind, color, order: i })),
    customColumns: [],
    columnOrders: {},
    certificateStages: [...DEFAULT_CERTIFICATES],
    leads: [],
    activities: [],
    meetings: [],
  };
}

/* Sample employees from the generated fake data (not ones the admin created). */
const isSampleEmployee = (u) => {
  const e = u.email.toLowerCase();
  return u.role === 'agent' && !TEAM_EMPLOYEES.some((t) => t.email === e) && (e.endsWith('@leadflow.demo') || /^agent\d+@demo\.com$/.test(e));
};

/* One-time: keep only Rasha & Entesar as employees. Sample employees are removed and
   their leads, activity and meetings are shared between the two. */
const ONLY_TEAM_FLAG = 'onlyTeamV2'; // V1 could be saved without running (bug) — V2 re-runs it
function keepOnlyTeam(s) {
  const team = TEAM_EMPLOYEES.map((t) => s.users.find((u) => u.email.toLowerCase() === t.email)).filter(Boolean);
  const removed = s.users.filter(isSampleEmployee);
  if (!team.length || !removed.length) return s;
  const to = Object.fromEntries(removed.map((u, i) => [u.id, team[i % team.length].id]));
  // spread each removed employee's leads across the team, keeping a lead's history with its new owner
  const leadOwner = {};
  let n = 0;
  const leads = s.leads.map((l) => {
    if (!to[l.ownerId]) return l;
    const owner = team[n++ % team.length].id;
    leadOwner[l.id] = owner;
    return { ...l, ownerId: owner };
  });
  const remap = (id, leadId) => leadOwner[leadId] ?? to[id] ?? id;
  return {
    ...s,
    users: s.users.filter((u) => !isSampleEmployee(u)),
    leads,
    activities: s.activities.map((a) => (to[a.userId] ? { ...a, userId: remap(a.userId, a.leadId) } : a)),
    meetings: s.meetings.map((m) => (to[m.agentId] ? { ...m, agentId: remap(m.agentId, m.leadId) } : m)),
  };
}

/* Fill in anything missing from older saved data. */
export function migrate(s) {
  const done = migrateBase(s);
  // check the flag on the SAVED data (the defaults merged in by migrateBase always carry it)
  return s[ONLY_TEAM_FLAG] ? done : { ...keepOnlyTeam(done), [ONLY_TEAM_FLAG]: true };
}

function migrateBase(s) {
  const base = createInitialState();
  // admin placeholder names from earlier versions -> Sarah Aljani
  const users = (s.users?.length ? s.users : base.users).map((u) =>
    u.role === 'admin' && u.email === 'admin@admin.com' && ['Administrator', 'Alex Morgan'].includes(u.name) ? { ...u, name: 'Sarah Aljani' } : u,
  );
  return {
    ...base,
    ...s,
    version: SCHEMA_VERSION,
    [TEAM_FLAG]: true,
    users: s[TEAM_FLAG] ? users : ensureTeam(users),
    stages: s.stages?.length ? s.stages : base.stages,
    certificateStages: s.certificateStages ?? base.certificateStages,
    customColumns: s.customColumns ?? [],
    columnOrders: s.columnOrders ?? {},
    leads: (s.leads ?? []).map((l) => ({ files: [], custom: {}, ...l, flags: { ...emptyFlags(), ...l.flags } })),
    activities: s.activities ?? [],
    meetings: s.meetings ?? [],
  };
}
