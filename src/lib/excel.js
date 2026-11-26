import * as XLSX from 'xlsx';
import { FLAGS } from '../store/defaults';
import { computeLeaderboard, computeMonth, OUTCOMES, pipelineCounts } from './stats';
import { fmtDateTime, inRange, monthLabel, monthRange } from './utils';

export const LEAD_FIELDS = [
  { key: 'name', label: 'Name', aliases: ['fullname', 'name', 'studentname', 'leadname', 'الاسم'] },
  { key: 'email', label: 'Email', aliases: ['email', 'mail', 'emailaddress', 'البريد'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'mobile', 'phonenumber', 'tel', 'whatsapp', 'الهاتف', 'الجوال'] },
  { key: 'city', label: 'City', aliases: ['city', 'المدينة'] },
  { key: 'country', label: 'Country', aliases: ['country', 'الدولة'] },
  { key: 'nationality', label: 'Nationality', aliases: ['nationality', 'الجنسية'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex', 'الجنس'] },
  { key: 'certificateStage', label: 'Last certificate', aliases: ['certificate', 'lastcertificate', 'certificatestage', 'education', 'degree', 'qualification', 'المؤهل'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'ملاحظات'] },
  { key: 'createdAt', label: 'Date created', aliases: ['datecreated', 'createdat', 'created', 'date'] },
  { key: 'lastContactAt', label: 'Last contact', aliases: ['lastcontact', 'lastcontactdate', 'lastcontacted', 'lastcall'] },
  { key: 'stage', label: 'Stage / status', aliases: ['stage', 'status', 'leadstatus', 'pipeline'] },
  { key: 'owner', label: 'Employee (email or name)', aliases: ['owner', 'employee', 'agent', 'assignedto', 'salesperson'] },
];

export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const sheets = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true });
  }
  return { names: wb.SheetNames, sheets };
}

export function parseDate(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    if (!p) return null;
    return new Date(p.y, p.m - 1, p.d, p.H, p.M, p.S).toISOString();
  }
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

export function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'x', '✓', 'نعم'].includes(s);
}

function download(wb, filename) {
  XLSX.writeFile(wb, filename);
}

const yesNo = (b) => (b ? 'Yes' : 'No');

export function leadsToRows(leads, { stageById, userById, customColumns }) {
  return leads.map((l) => {
    const row = {
      Name: l.name,
      Email: l.email,
      Phone: l.phone,
      City: l.city,
      Country: l.country,
      Nationality: l.nationality,
      Gender: l.gender,
      'Last certificate': l.certificateStage,
      Stage: stageById[l.stageId]?.name ?? '',
      Employee: userById[l.ownerId]?.name ?? '',
      'Date created': fmtDateTime(l.createdAt),
      'Last contact': l.lastContactAt ? fmtDateTime(l.lastContactAt) : '',
    };
    for (const f of FLAGS) row[f.label] = yesNo(l.flags?.[f.key]);
    for (const c of customColumns) {
      const v = l.custom?.[c.id];
      row[c.label] = c.type === 'checkbox' ? yesNo(v) : v ?? '';
    }
    row.Notes = l.notes;
    row.Files = l.files?.length ?? 0;
    return row;
  });
}

export function exportLeads(leads, lookups, filename = 'leads.xlsx') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadsToRows(leads, lookups)), 'Leads');
  download(wb, filename);
}

export function exportTemplate(customColumns) {
  const headers = [...LEAD_FIELDS.map((f) => f.label), ...FLAGS.map((f) => f.label), ...customColumns.map((c) => c.label)];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers]), 'Leads');
  download(wb, 'leads-template.xlsx');
}

/** Full month report: summary, employees, daily activity, pipeline, meetings, new leads. */
export function exportMonthReport(state, key, lookups) {
  const { stages, userById, leadById } = lookups;
  const label = monthLabel(key);
  const m = computeMonth(state, key);
  const wb = XLSX.utils.book_new();

  const summary = [
    ['Report', `Leads follow-up — ${label}`],
    [],
    ['Metric', 'Value'],
    ['New leads', m.newLeads],
    ...OUTCOMES.map((o) => [o.label, m[o.key]]),
    ['Calls (total)', m.calls],
    ['  3CX calls', m.calls3cx],
    ['  WhatsApp calls', m.callsWhatsapp],
    ['  Answered calls', m.answeredCalls],
    ['WhatsApp messages', m.messages],
    ['Follow-ups', m.followUps],
    ['Meetings (total)', m.meetingsTotal],
    ['  Done', m.meetingsDone],
    ['  Scheduled', m.meetingsScheduled],
    ['  Cancelled', m.meetingsCancelled],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const board = computeLeaderboard(state, key).map((r) => ({
    Employee: r.user.name,
    'New leads': r.newLeads,
    Calls: r.calls,
    'Answered calls': r.answeredCalls,
    'WhatsApp messages': r.messages,
    'Follow-ups': r.followUps,
    'Meetings done': r.meetingsDone,
    'Meetings scheduled': r.meetingsScheduled,
    Interested: r.interested,
    'Very interested': r.very_interested,
    'Not interested': r.not_interested,
    'Meeting done – candidate': r.meeting_candidate,
    'Meeting done – not a candidate': r.meeting_not_candidate,
    Registered: r.registered,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(board), 'Employees');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(m.daily.map((d) => ({ Day: d.day, Calls: d.calls, 'WhatsApp messages': d.messages, 'Follow-ups': d.followUps }))),
    'Daily activity',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(pipelineCounts(state, stages).map((p) => ({ Stage: p.name, 'Leads (now)': p.value }))),
    'Pipeline now',
  );

  const range = monthRange(key);
  const meetings = state.meetings
    .filter((x) => inRange(x.scheduledAt, range))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((x) => ({
      Date: fmtDateTime(x.scheduledAt),
      Title: x.title,
      Lead: leadById[x.leadId]?.name ?? '(deleted)',
      Employee: userById[x.agentId]?.name ?? '',
      Status: x.status,
      Notes: x.notes,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meetings.length ? meetings : [{ Date: 'No meetings' }]), 'Meetings');

  const newLeads = state.leads.filter((l) => inRange(l.createdAt, range));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(newLeads.length ? leadsToRows(newLeads, { ...lookups, customColumns: state.customColumns }) : [{ Name: 'No new leads' }]),
    'New leads',
  );

  download(wb, `leads-report-${key}.xlsx`);
}

/* ======================= pipeline & full-data exports ======================= */

/** json_to_sheet with column widths sized to the content. */
function sheetFrom(rows, emptyNote = 'No data') {
  const data = rows.length ? rows : [{ Info: emptyNote }];
  const ws = XLSX.utils.json_to_sheet(data);
  const keys = Object.keys(data[0]);
  ws['!cols'] = keys.map((k) => ({
    wch: Math.min(48, Math.max(k.length, ...data.slice(0, 300).map((r) => String(r[k] ?? '').length)) + 2),
  }));
  return ws;
}

/** Excel sheet names: max 31 chars, no []:*?/\ and unique. */
function addSheet(wb, ws, name) {
  const base = String(name).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = base;
  for (let i = 2; wb.SheetNames.includes(n); i++) n = `${base.slice(0, 27)} (${i})`;
  XLSX.utils.book_append_sheet(wb, ws, n);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const safeFile = (s) => s.replace(/[^\w؀-ۿ-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function sortByStage(leads, stages) {
  const order = Object.fromEntries(stages.map((s, i) => [s.id, i]));
  return [...leads].sort((a, b) => (order[a.stageId] ?? 99) - (order[b.stageId] ?? 99) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * Export one pipeline (an employee's board) or all pipelines.
 * owner: user object for one pipeline, null for all pipelines.
 */
export function exportPipeline(leads, { owner, filtered, customColumns }, lookups) {
  const { stages, userById, agents } = lookups;
  const wb = XLSX.utils.book_new();
  const title = owner ? `${owner.name} — pipeline` : 'All pipelines';
  const rowsOf = (list) => leadsToRows(sortByStage(list, stages), { ...lookups, customColumns });

  const summary = [
    [title],
    [`Exported ${fmtDateTime(new Date().toISOString())}${filtered ? ' — only leads matching the current search' : ''}`],
    [],
  ];
  if (owner) {
    summary.push(['Status', 'Leads']);
    for (const s of stages) summary.push([s.name, leads.filter((l) => l.stageId === s.id).length]);
    summary.push(['Total', leads.length]);
  } else {
    const people = [...agents, ...Object.values(userById).filter((u) => u.role === 'admin')].filter((u) => leads.some((l) => l.ownerId === u.id));
    summary.push(['Status', ...people.map((u) => u.name), 'Total']);
    for (const s of stages) {
      const inStage = leads.filter((l) => l.stageId === s.id);
      summary.push([s.name, ...people.map((u) => inStage.filter((l) => l.ownerId === u.id).length), inStage.length]);
    }
    summary.push(['Total', ...people.map((u) => leads.filter((l) => l.ownerId === u.id).length), leads.length]);
  }
  const ws = XLSX.utils.aoa_to_sheet(summary);
  ws['!cols'] = [{ wch: 26 }, ...Array(12).fill({ wch: 14 })];
  addSheet(wb, ws, 'Summary');

  addSheet(wb, sheetFrom(rowsOf(leads), 'No leads'), owner ? 'Leads' : 'All leads');
  if (!owner) {
    for (const u of Object.values(userById)) {
      const mine = leads.filter((l) => l.ownerId === u.id);
      if (mine.length) addSheet(wb, sheetFrom(rowsOf(mine)), u.name);
    }
  }
  XLSX.writeFile(wb, `${safeFile(owner ? `pipeline-${owner.name}` : 'all-pipelines')}-${stamp()}.xlsx`);
}

/** Months from the first month with data up to the current month. */
export function allMonths(state) {
  const dates = [...state.leads.map((l) => l.createdAt), ...state.activities.map((a) => a.at)].filter(Boolean).sort();
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let k = dates.length ? dates[0].slice(0, 7) : cur;
  if (k > cur) k = cur;
  const out = [];
  while (k <= cur) {
    out.push(k);
    const [y, m] = k.split('-').map(Number);
    k = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  }
  return out;
}

const monthRow = (m) => ({
  'New leads': m.newLeads,
  'Leads contacted': m.contactedLeads,
  Interested: m.interested,
  'Very interested': m.very_interested,
  'Not interested': m.not_interested,
  'Meeting done – candidate': m.meeting_candidate,
  'Meeting done – not a candidate': m.meeting_not_candidate,
  Registered: m.registered,
  'Blocked us': m.blocked,
  Calls: m.calls,
  '3CX calls': m.calls3cx,
  'WhatsApp calls': m.callsWhatsapp,
  'Answered calls': m.answeredCalls,
  'WhatsApp messages': m.messages,
  'Follow-ups': m.followUps,
  'Meetings done': m.meetingsDone,
  'Meetings planned': m.meetingsScheduled,
  'Meetings cancelled': m.meetingsCancelled,
});

const ACTIVITY_LABELS = {
  created: 'Lead created',
  stage_change: 'Status changed',
  call_3cx: '3CX call',
  call_whatsapp: 'WhatsApp call',
  message_whatsapp: 'WhatsApp message',
  follow_up: 'Follow-up',
  note: 'Note',
  meeting: 'Meeting',
  file: 'File',
};

/** Build the all-data workbook (separate from download so it can be tested). */
export function buildAllDataWorkbook(state, lookups) {
  const { stages, stageById, userById, leadById } = lookups;
  const wb = XLSX.utils.book_new();
  const months = allMonths(state);
  const agents = state.users.filter((u) => u.role === 'agent');

  const totals = {};
  for (const k of months) for (const [key, v] of Object.entries(monthRow(computeMonth(state, k)))) totals[key] = (totals[key] ?? 0) + v;
  // "Leads contacted" can't be summed across months (same lead in several months)
  delete totals['Leads contacted'];

  const overview = [
    ['LeadFlow — all data export'],
    [`Exported ${fmtDateTime(new Date().toISOString())}`],
    [`Period: ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`],
    [],
    ['Metric', 'All time'],
    ['Leads in the system', state.leads.length],
    ['Call center employees', agents.length],
    ['Status columns', stages.length],
    ...Object.entries(totals),
    [],
    ['Leads per status (now)', ''],
    ...pipelineCounts(state, stages).map((p) => [p.name, p.value]),
  ];
  const ov = XLSX.utils.aoa_to_sheet(overview);
  ov['!cols'] = [{ wch: 30 }, { wch: 14 }];
  addSheet(wb, ov, 'Overview');

  addSheet(wb, sheetFrom(months.map((k) => ({ Month: monthLabel(k), ...monthRow(computeMonth(state, k)) }))), 'Monthly statistics');
  const perEmp = [];
  for (const u of agents) for (const k of months) perEmp.push({ Employee: u.name, Month: monthLabel(k), ...monthRow(computeMonth(state, k, { userId: u.id })) });
  addSheet(wb, sheetFrom(perEmp, 'No employees'), 'Employees monthly');

  addSheet(wb, sheetFrom(leadsToRows(sortByStage(state.leads, stages), { ...lookups, customColumns: state.customColumns }), 'No leads'), 'All leads');

  const actRows = [...state.activities]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((a) => {
      const lead = leadById[a.leadId];
      let details = a.meta?.text ?? '';
      if (a.type === 'stage_change') details = `Moved to ${stageById[a.meta?.to]?.name ?? 'a deleted status'}`;
      return {
        Date: fmtDateTime(a.at),
        Lead: lead?.name ?? '(deleted lead)',
        Phone: lead?.phone ?? '',
        'Done by': userById[a.userId]?.name ?? '(deleted user)',
        Activity: ACTIVITY_LABELS[a.type] ?? a.type,
        Answered: a.meta?.answered === undefined ? '' : a.meta.answered ? 'Yes' : 'No',
        Details: details,
      };
    });
  addSheet(wb, sheetFrom(actRows, 'No activity'), 'Activity log');

  addSheet(
    wb,
    sheetFrom(
      [...state.meetings]
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
        .map((m) => ({
          Date: fmtDateTime(m.scheduledAt),
          Title: m.title,
          Lead: leadById[m.leadId]?.name ?? '(deleted lead)',
          Phone: leadById[m.leadId]?.phone ?? '',
          Employee: userById[m.agentId]?.name ?? '',
          Status: m.status,
          Notes: m.notes,
        })),
      'No meetings',
    ),
    'Meetings',
  );

  addSheet(
    wb,
    sheetFrom(
      state.users.map((u) => ({
        Name: u.name,
        Email: u.email,
        Phone: u.phone,
        Role: u.role === 'admin' ? 'Admin' : 'Call center',
        Active: u.active ? 'Yes' : 'No',
        Leads: state.leads.filter((l) => l.ownerId === u.id).length,
        Added: fmtDateTime(u.createdAt),
      })),
    ),
    'Employees',
  );

  addSheet(
    wb,
    sheetFrom(stages.map((s, i) => ({ Position: i + 1, Status: s.name, 'Counts as': s.kind, Color: s.color, Leads: state.leads.filter((l) => l.stageId === s.id).length }))),
    'Statuses',
  );
  return wb;
}

export function exportAllData(state, lookups) {
  XLSX.writeFile(buildAllDataWorkbook(state, lookups), `leadflow-all-data-${stamp()}.xlsx`);
}
