import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, Clock, Download, FileSpreadsheet, GripVertical, ListOrdered, Mail, Phone, Plus, Search, Trash2, X } from 'lucide-react';
import { STAGE_KINDS } from '../store/defaults';
import { personalStages, useLookups, useStore, useVisibleLeads } from '../store/StoreContext';
import LeadModal from '../components/LeadModal';
import { Avatar, FlagIcons } from '../components/ui';
import { timeAgo } from '../lib/utils';
import { exportPipeline } from '../lib/excel';

export default function Pipeline() {
  const { state, user, actions } = useStore();
  // Leads per status across ALL pipelines — a column may look empty on one employee's board but not be.
  const stageTotals = useMemo(() => {
    const c = {};
    for (const l of state.leads) c[l.stageId] = (c[l.stageId] ?? 0) + 1;
    return c;
  }, [state.leads]);
  const lookups = useLookups();
  const { userById, agents } = lookups;
  const leads = useVisibleLeads();
  const isAdmin = user.role === 'admin';
  // Admin arranges the columns for everyone; an employee can rearrange her own board on top of that.
  const myOrder = isAdmin ? null : state.columnOrders?.[user.id];
  const stages = useMemo(() => (isAdmin ? lookups.stages : personalStages(lookups.stages, myOrder)), [isAdmin, lookups.stages, myOrder]);
  const moveColumn = isAdmin ? actions.reorderStage : actions.reorderMyColumn;
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { ownerId } = useParams();
  const owner = isAdmin && ownerId && userById[ownerId] ? ownerId : 'all';
  const setOwner = (id) => navigate(id === 'all' ? '/pipeline' : `/pipeline/${id}`);
  const ownerName = owner !== 'all' ? userById[owner]?.name : null;
  const [open, setOpen] = useState(null); // {id} | {new:true, stageId}
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [dragStageId, setDragStageId] = useState(null); // column being moved (admin)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads
      .filter((l) => owner === 'all' || l.ownerId === owner)
      .filter((l) => !s || [l.name, l.phone, l.email, l.city].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [leads, q, owner]);

  const byStage = useMemo(() => {
    const m = Object.fromEntries(stages.map((s) => [s.id, []]));
    for (const l of filtered) (m[l.stageId] ??= []).push(l);
    return m;
  }, [filtered, stages]);

  const drop = (stageId) => {
    if (dragId) {
      const lead = leads.find((l) => l.id === dragId);
      if (lead && lead.stageId !== stageId) actions.updateLead(dragId, { stageId });
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="row" style={{ gap: 12 }}>
            {ownerName && <Avatar name={ownerName} />}
            {ownerName ? `${ownerName}'s pipeline` : isAdmin ? 'All pipelines' : 'My pipeline'}
          </h1>
          <p>
            {filtered.length} leads · drag a lead card to another column to change its status
            {' · drag a column header to move the column'}.
          </p>
        </div>
        <div className="spacer" />
        <div className="search">
          <Search size={15} />
          <input className="input" placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isAdmin && (
          <select className="select" style={{ width: 190 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">All employees</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value={user.id}>{user.name} (me)</option>
          </select>
        )}
        <ColumnOrderMenu
          stages={stages}
          onMove={moveColumn}
          note={isAdmin ? 'This is the default order for everyone.' : 'Only changes your own board.'}
          onReset={!isAdmin && myOrder?.length ? actions.resetMyColumnOrder : null}
        />
        <button
          className="btn"
          title={ownerName ? `Import an Excel sheet of leads into ${ownerName}'s pipeline` : 'Import an Excel sheet of leads'}
          onClick={() => navigate(owner !== 'all' ? `/import?to=${owner}` : '/import')}
        >
          <FileSpreadsheet size={15} /> Import Excel
        </button>
        <button
          className="btn"
          title={`Download ${ownerName ? `${ownerName}'s` : isAdmin ? 'all' : 'my'} pipeline leads as Excel${q.trim() ? ' (only leads matching the search)' : ''}`}
          onClick={() =>
            exportPipeline(
              filtered,
              { owner: owner !== 'all' ? userById[owner] : isAdmin ? null : user, filtered: !!q.trim(), customColumns: state.customColumns },
              lookups,
            )
          }
        >
          <Download size={15} /> Export
        </button>
        <button className="btn primary" onClick={() => setOpen({ new: true })}>
          <Plus size={15} /> Add lead
        </button>
      </div>

      <div className="board">
        {stages.map((s, idx) => {
          const items = byStage[s.id] ?? [];
          const fromIdx = dragStageId ? stages.findIndex((x) => x.id === dragStageId) : -1;
          const colTarget = dragStageId && overStage === s.id && dragStageId !== s.id;
          const cls = [
            'column',
            !dragStageId && overStage === s.id ? 'drop' : '',
            dragStageId === s.id ? 'moving' : '',
            colTarget ? (fromIdx < idx ? 'insert-after' : 'insert-before') : '',
          ].join(' ');
          return (
            <div
              key={s.id}
              className={cls}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overStage !== s.id) setOverStage(s.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragStageId) {
                  moveColumn(dragStageId, idx);
                  setDragStageId(null);
                  setOverStage(null);
                } else drop(s.id);
              }}
            >
              <div
                className="column-head movable"
                draggable
                title="Drag to move this column"
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', 'stage:' + s.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragStageId(s.id);
                }}
                onDragEnd={() => {
                  setDragStageId(null);
                  setOverStage(null);
                }}
              >
                <GripVertical size={14} className="grip" />
                <span className="stripe" style={{ background: s.color }} />
                {s.name}
                <span className="count num">{items.length}</span>
                {isAdmin && (
                  <button
                    className="icon-btn col-del"
                    disabled={(stageTotals[s.id] ?? 0) > 0 || stages.length <= 1}
                    title={
                      (stageTotals[s.id] ?? 0) > 0
                        ? `Can't delete: ${stageTotals[s.id]} lead${stageTotals[s.id] === 1 ? '' : 's'} in this status (all pipelines). Move them first.`
                        : `Delete "${s.name}"`
                    }
                    onClick={() => confirm(`Delete the status column "${s.name}"?`) && actions.deleteStage(s.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="column-body">
                {items.map((l) => (
                  <div
                    key={l.id}
                    className={`lead-card ${dragId === l.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(l.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    onClick={() => setOpen({ id: l.id })}
                  >
                    <div className="name">{l.name}</div>
                    <div className="meta">
                      {l.phone && (
                        <span className="row" style={{ gap: 5 }}>
                          <Phone size={11} /> {l.phone}
                        </span>
                      )}
                      {l.email && (
                        <span className="row" style={{ gap: 5 }}>
                          <Mail size={11} /> {l.email}
                        </span>
                      )}
                    </div>
                    <div className="foot">
                      <Clock size={11} /> {timeAgo(l.lastContactAt)}
                      <span className="spacer" />
                      <FlagIcons flags={l.flags} />
                      {isAdmin && <Avatar name={userById[l.ownerId]?.name} sm />}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="column-empty">Drop leads here</div>}
                <button className="btn ghost sm" style={{ justifyContent: 'center' }} onClick={() => setOpen({ new: true, stageId: s.id })}>
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          );
        })}
        {isAdmin && <AddStageColumn stages={stages} onAdd={actions.addStage} />}
      </div>

      {open && <LeadModal leadId={open.id} defaultStageId={open.stageId} defaultOwnerId={owner !== 'all' ? owner : undefined} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Dropdown listing every status column; drag or use arrows to reorder. Changes apply to the board live. */
function ColumnOrderMenu({ stages, onMove, note, onReset }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const fromIdx = drag ? stages.findIndex((x) => x.id === drag) : -1;
  const reset = () => {
    setDrag(null);
    setOver(null);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={`btn ${open ? 'soft' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ListOrdered size={15} /> Column order <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dropdown order-menu" onDragOver={(e) => e.stopPropagation()}>
          <div className="dd-head">
            Column order
            <div className="small muted" style={{ fontWeight: 400 }}>Drag a name or use the arrows. The board updates instantly. {note}</div>
          </div>
          {stages.map((s, i) => {
            const target = drag && over === s.id && drag !== s.id;
            return (
              <div
                key={s.id}
                className={`order-item ${drag === s.id ? 'moving' : ''} ${target ? (fromIdx < i ? 'below' : 'above') : ''}`}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData('text/plain', 'order:' + s.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag(s.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (over !== s.id) setOver(s.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (drag) onMove(drag, i);
                  reset();
                }}
                onDragEnd={reset}
              >
                <GripVertical size={14} className="grip" />
                <span className="num muted small" style={{ width: 18, textAlign: 'right' }}>{i + 1}</span>
                <span className="stripe" style={{ background: s.color }} />
                <span className="order-name">{s.name}</span>
                <button className="icon-btn" title="Move up (left on the board)" disabled={i === 0} onClick={() => onMove(s.id, i - 1)}>
                  <ArrowUp size={14} />
                </button>
                <button className="icon-btn" title="Move down (right on the board)" disabled={i === stages.length - 1} onClick={() => onMove(s.id, i + 1)}>
                  <ArrowDown size={14} />
                </button>
              </div>
            );
          })}
          {onReset && (
            <button className="btn ghost sm" style={{ margin: '6px 8px 4px', justifyContent: 'center' }} onClick={onReset}>
              Reset to the default order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_COLORS = ['#5b4fe9', '#2563eb', '#0891b2', '#12a150', '#c98500', '#f2711c', '#e5484d', '#c026d3', '#64748b'];

/** Ghost column at the end of the board for adding a new status. */
function AddStageColumn({ stages, onAdd }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(STAGE_COLORS[0]);
  const [kind, setKind] = useState('custom');
  const [err, setErr] = useState('');

  const reset = () => {
    setEditing(false);
    setName('');
    setKind('custom');
    setErr('');
  };
  const save = () => {
    const n = name.trim();
    if (!n) return setErr('Enter a name');
    if (stages.some((s) => s.name.trim().toLowerCase() === n.toLowerCase())) return setErr('A status with this name already exists');
    onAdd({ name: n, color, kind });
    setColor(STAGE_COLORS[(STAGE_COLORS.indexOf(color) + 1) % STAGE_COLORS.length]);
    reset();
  };

  if (!editing)
    return (
      <button className="column add-column" onClick={() => setEditing(true)}>
        <Plus size={18} /> Add status
      </button>
    );

  return (
    <div className="column add-column editing" onKeyDown={(e) => e.key === 'Escape' && reset()}>
      <div className="stack" style={{ gap: 10, padding: 14 }}>
        <b>New status column</b>
        <input
          className="input"
          placeholder="e.g. Waiting for documents"
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            setErr('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <div className="row wrap" style={{ gap: 6 }}>
          {STAGE_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} title={c} onClick={() => setColor(c)} />
          ))}
        </div>
        <label className="field">
          <span>Counts in the dashboard as</span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {STAGE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        {err && <div className="error">{err}</div>}
        <div className="row">
          <button className="btn primary sm" onClick={save}>
            <Check size={14} /> Add column
          </button>
          <button className="btn ghost sm" onClick={reset}>
            <X size={14} /> Cancel
          </button>
        </div>
        <span className="small muted">Added at the end. Use "Column order" to move it.</span>
      </div>
    </div>
  );
}
