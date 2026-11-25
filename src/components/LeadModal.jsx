import { useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft, CalendarClock, CalendarPlus, Download, FileText, MessageCircle, Paperclip, Phone, PhoneCall,
  Plus, Repeat, StickyNote, Trash2, Upload, UserPlus,
} from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import { ACTIVITY_TYPES, FLAGS, GENDERS, LOGGABLE_ACTIVITIES } from '../store/defaults';
import { fmtBytes, fmtDateTime, fromLocalInput, readFileAsDataUrl, timeAgo, toLocalInput } from '../lib/utils';
import { Modal, StageBadge, Tabs } from './ui';

const MAX_FILE = 10 * 1024 * 1024;

const ACT_ICONS = {
  created: UserPlus,
  stage_change: ArrowRightLeft,
  call_3cx: PhoneCall,
  call_whatsapp: Phone,
  message_whatsapp: MessageCircle,
  follow_up: Repeat,
  note: StickyNote,
  meeting: CalendarClock,
  file: Paperclip,
};

export function CustomFieldInput({ col, value, onChange }) {
  if (col.type === 'checkbox')
    return (
      <label className="check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {col.label}
      </label>
    );
  if (col.type === 'select')
    return (
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {col.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  return (
    <input
      className="input"
      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function LeadModal({ leadId, defaultStageId, defaultOwnerId, onClose }) {
  const { state, user, actions } = useStore();
  const { stages, stageById, userById, agents } = useLookups();
  const lead = leadId ? state.leads.find((l) => l.id === leadId) : null;
  const isNew = !leadId;
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState('details');
  const [draft, setDraft] = useState(() =>
    lead
      ? { ...lead, flags: { ...lead.flags }, custom: { ...lead.custom } }
      : {
          name: '', email: '', phone: '', city: '', country: '', nationality: '', gender: '', certificateStage: '', notes: '',
          stageId: defaultStageId || stages[0]?.id, ownerId: isAdmin ? defaultOwnerId ?? agents[0]?.id ?? user.id : user.id,
          flags: {}, custom: {}, lastContactAt: null,
        },
  );
  const [error, setError] = useState('');
  const initial = useRef(draft);

  if (!isNew && !lead) return null; // deleted while open

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setFlag = (k, v) => setDraft((d) => ({ ...d, flags: { ...d.flags, [k]: v } }));
  const setCustom = (k, v) => setDraft((d) => ({ ...d, custom: { ...d.custom, [k]: v } }));

  const save = () => {
    if (!draft.name.trim()) return setError('Name is required');
    if (!draft.phone.trim() && !draft.email.trim()) return setError('Add a phone number or an email');
    if (isNew) {
      actions.addLead(draft);
      onClose();
      return;
    }
    // Only send what changed in this form, so calls/files logged meanwhile aren't overwritten.
    const init = initial.current;
    const patch = {};
    for (const k of Object.keys(draft)) {
      if (['id', 'files', 'flags', 'custom', 'updatedAt'].includes(k)) continue;
      if (draft[k] !== init[k]) patch[k] = draft[k];
    }
    const diffObj = (a, b) => Object.fromEntries(Object.entries(a).filter(([k, v]) => v !== b[k]));
    const flagChanges = diffObj(draft.flags, init.flags);
    const customChanges = diffObj(draft.custom, init.custom);
    if (Object.keys(flagChanges).length) patch.flags = { ...lead.flags, ...flagChanges };
    if (Object.keys(customChanges).length) patch.custom = { ...lead.custom, ...customChanges };
    if (Object.keys(patch).length) actions.updateLead(lead.id, patch);
    onClose();
  };

  const remove = () => {
    if (confirm(`Delete lead "${lead.name}"? This also deletes its activity and meetings.`)) {
      actions.deleteLeads([lead.id]);
      onClose();
    }
  };

  const ownerOptions = state.users.filter((u) => u.active);

  const details = (
    <div className="stack">
      <div className="form-grid">
        <label className="field">
          <span>Full name *</span>
          <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Phone</span>
          <input className="input" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label className="field">
          <span>Gender</span>
          <select className="select" value={draft.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>City</span>
          <input className="input" value={draft.city} onChange={(e) => set('city', e.target.value)} />
        </label>
        <label className="field">
          <span>Country</span>
          <input className="input" value={draft.country} onChange={(e) => set('country', e.target.value)} />
        </label>
        <label className="field">
          <span>Nationality</span>
          <input className="input" value={draft.nationality} onChange={(e) => set('nationality', e.target.value)} />
        </label>
        <label className="field">
          <span>Last certificate stage</span>
          <select className="select" value={draft.certificateStage} onChange={(e) => set('certificateStage', e.target.value)}>
            <option value="">—</option>
            {[...new Set([...state.certificateStages, draft.certificateStage].filter(Boolean))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Stage / status</span>
          <select className="select" value={draft.stageId ?? ''} onChange={(e) => set('stageId', e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {isAdmin && (
          <label className="field">
            <span>Assigned employee</span>
            <select className="select" value={draft.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
              {ownerOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.role === 'admin' ? '(admin)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {!isNew && (
          <label className="field">
            <span>Date created</span>
            <input className="input" type="datetime-local" value={toLocalInput(draft.createdAt)} onChange={(e) => set('createdAt', fromLocalInput(e.target.value) ?? lead.createdAt)} />
          </label>
        )}
        <label className="field">
          <span>Last contact</span>
          <input className="input" type="datetime-local" value={toLocalInput(draft.lastContactAt)} onChange={(e) => set('lastContactAt', fromLocalInput(e.target.value))} />
        </label>
      </div>

      <div>
        <div className="section-title" style={{ marginTop: 6 }}>Contact status</div>
        <div className="row wrap" style={{ gap: '10px 22px' }}>
          {FLAGS.map((f) => (
            <label className="check" key={f.key}>
              <input type="checkbox" checked={!!draft.flags[f.key]} onChange={(e) => setFlag(f.key, e.target.checked)} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      {state.customColumns.length > 0 && (
        <div>
          <div className="section-title" style={{ marginTop: 6 }}>Extra data</div>
          <div className="form-grid">
            {state.customColumns.map((c) => (
              <label className="field" key={c.id}>
                {c.type !== 'checkbox' && <span>{c.label}</span>}
                <CustomFieldInput col={c} value={draft.custom[c.id]} onChange={(v) => setCustom(c.id, v)} />
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {error && <div className="error">{error}</div>}
    </div>
  );

  const footer = (
    <>
      {!isNew && (
        <button className="btn danger" onClick={remove} style={{ marginRight: 'auto' }}>
          <Trash2 size={15} /> Delete
        </button>
      )}
      <button className="btn" onClick={onClose}>
        Cancel
      </button>
      {tab === 'details' && (
        <button className="btn primary" onClick={save}>
          {isNew ? 'Create lead' : 'Save changes'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      wide
      onClose={onClose}
      footer={footer}
      title={
        isNew ? (
          'New lead'
        ) : (
          <span className="row">
            {lead.name} <StageBadge stage={stageById[lead.stageId]} />
          </span>
        )
      }
    >
      {!isNew && (
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'details', label: 'Details', icon: FileText },
            { value: 'activity', label: 'Activity & calls', icon: PhoneCall },
            { value: 'files', label: `Files (${lead.files.length})`, icon: Paperclip },
            { value: 'meetings', label: 'Meetings', icon: CalendarClock },
          ]}
        />
      )}
      {tab === 'details' && details}
      {tab === 'activity' && <ActivityTab lead={lead} />}
      {tab === 'files' && <FilesTab lead={lead} />}
      {tab === 'meetings' && <MeetingsTab lead={lead} />}
      {!isNew && tab === 'details' && (
        <div className="small muted" style={{ marginTop: 12 }}>
          Owner: {userById[lead.ownerId]?.name ?? '—'} · Created {fmtDateTime(lead.createdAt)} · Last contact {timeAgo(lead.lastContactAt)}
        </div>
      )}
    </Modal>
  );
}

function ActivityTab({ lead }) {
  const { state, actions } = useStore();
  const { stageById, userById } = useLookups();
  const [type, setType] = useState('call_3cx');
  const [answered, setAnswered] = useState('yes');
  const [text, setText] = useState('');
  const isCall = ACTIVITY_TYPES[type].isCall;

  const items = useMemo(
    () => state.activities.filter((a) => a.leadId === lead.id).sort((a, b) => b.at.localeCompare(a.at)),
    [state.activities, lead.id],
  );

  const log = () => {
    if (type === 'note' && !text.trim()) return;
    actions.logActivity(lead.id, type, { text: text.trim(), ...(isCall ? { answered: answered === 'yes' } : {}) });
    setText('');
  };

  const describe = (a) => {
    if (a.type === 'stage_change') return `Moved to ${stageById[a.meta?.to]?.name ?? 'a deleted stage'}`;
    let s = ACTIVITY_TYPES[a.type]?.label ?? a.type;
    if (a.meta?.answered === true) s += ' — answered';
    if (a.meta?.answered === false) s += ' — no answer';
    return s;
  };

  return (
    <div className="stack">
      <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
        <div className="row wrap">
          <select className="select" style={{ width: 190 }} value={type} onChange={(e) => setType(e.target.value)}>
            {LOGGABLE_ACTIVITIES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPES[t].label}
              </option>
            ))}
          </select>
          {isCall && (
            <select className="select" style={{ width: 140 }} value={answered} onChange={(e) => setAnswered(e.target.value)}>
              <option value="yes">Answered</option>
              <option value="no">No answer</option>
            </select>
          )}
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Note (optional)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && log()} />
          <button className="btn primary" onClick={log}>
            <Plus size={15} /> Log
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Logging a call, message or follow-up updates "last contact" and counts in the employee statistics.
        </div>
      </div>
      <div className="timeline">
        {items.map((a) => {
          const Icon = ACT_ICONS[a.type] ?? StickyNote;
          return (
            <div className="tl-item" key={a.id}>
              <div className="tl-icon">
                <Icon size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="what">{describe(a)}</div>
                {a.meta?.text && <div className="ink2">{a.meta.text}</div>}
                <div className="when">
                  {fmtDateTime(a.at)} · {userById[a.userId]?.name ?? 'Unknown'}
                </div>
              </div>
              {LOGGABLE_ACTIVITIES.includes(a.type) && (
                <button className="icon-btn" title="Delete entry" onClick={() => confirm('Delete this entry?') && actions.deleteActivity(a.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilesTab({ lead }) {
  const { actions } = useStore();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');

  const add = async (fileList) => {
    setErr('');
    for (const f of fileList) {
      if (f.size > MAX_FILE) {
        setErr(`${f.name} is larger than 10 MB`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(f);
      actions.addFile(lead.id, { name: f.name, size: f.size, type: f.type, dataUrl });
    }
  };

  return (
    <div className="stack">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onClick={() => input.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
      >
        <Upload size={22} />
        <div>Drop files here or click to upload (max 10 MB each)</div>
        <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {err && <div className="error">{err}</div>}
      {lead.files.length === 0 ? (
        <div className="muted small">No files yet.</div>
      ) : (
        <table className="table">
          <tbody>
            {lead.files.map((f) => (
              <tr key={f.id}>
                <td>
                  <span className="row">
                    <Paperclip size={14} /> {f.name}
                  </span>
                </td>
                <td className="muted">{fmtBytes(f.size)}</td>
                <td className="muted">{fmtDateTime(f.uploadedAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  <a className="icon-btn" href={f.dataUrl} download={f.name} title="Download">
                    <Download size={15} />
                  </a>
                  <button className="icon-btn" title="Delete" onClick={() => confirm(`Delete ${f.name}?`) && actions.removeFile(lead.id, f.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MeetingsTab({ lead }) {
  const { state, user, actions } = useStore();
  const { userById } = useLookups();
  const [title, setTitle] = useState('Admission consultation');
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');
  const list = state.meetings.filter((m) => m.leadId === lead.id).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const add = () => {
    if (!when) return;
    actions.addMeeting({
      leadId: lead.id,
      agentId: user.role === 'admin' ? lead.ownerId : user.id,
      title: title.trim() || 'Meeting',
      scheduledAt: fromLocalInput(when),
      notes,
    });
    setWhen('');
    setNotes('');
  };

  return (
    <div className="stack">
      <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
        <div className="form-grid">
          <label className="field">
            <span>Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Date & time</span>
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="field full">
            <span>Notes</span>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!when} onClick={add}>
            <CalendarPlus size={15} /> Schedule meeting
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="muted small">No meetings for this lead yet.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Employee</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>{fmtDateTime(m.scheduledAt)}</td>
                <td className="wrap">
                  {m.title}
                  {m.notes && <div className="small muted">{m.notes}</div>}
                </td>
                <td>{userById[m.agentId]?.name}</td>
                <td>
                  <select className="select" style={{ width: 125 }} value={m.status} onChange={(e) => actions.updateMeeting(m.id, { status: e.target.value })}>
                    <option value="scheduled">Scheduled</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td>
                  <button className="icon-btn" onClick={() => confirm('Delete this meeting?') && actions.deleteMeeting(m.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
