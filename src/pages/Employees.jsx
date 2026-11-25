import { useMemo, useState } from 'react';
import { ArrowRightLeft, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useStore } from '../store/StoreContext';
import { Avatar, Empty, Modal } from '../components/ui';
import { computeMonth } from '../lib/stats';
import { fmtDate, monthKey } from '../lib/utils';

export default function Employees() {
  const { state, user: me, actions } = useStore();
  const [edit, setEdit] = useState(null); // user object | {} for new
  const [reassign, setReassign] = useState(null);

  const rows = useMemo(() => {
    const mk = monthKey();
    return state.users.map((u) => {
      const m = computeMonth(state, mk, { userId: u.id });
      return { u, leads: state.leads.filter((l) => l.ownerId === u.id).length, calls: m.calls, meetings: m.meetingsDone };
    });
  }, [state]);

  const remove = (u, leads) => {
    if (u.id === me.id) return alert("You can't delete your own account.");
    if (leads > 0) return alert(`${u.name} still has ${leads} leads. Reassign them first (or deactivate the account instead).`);
    if (confirm(`Delete ${u.name}? Their past activity stays in the statistics.`)) actions.deleteUser(u.id);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Employees</h1>
          <p>Call center sales employees log in and see only their own leads.</p>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEdit({})}>
          <UserPlus size={15} /> Add employee
        </button>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <Empty icon={Users} title="No employees" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email (login)</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Leads</th>
                  <th style={{ textAlign: 'right' }}>Calls this month</th>
                  <th style={{ textAlign: 'right' }}>Meetings this month</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ u, leads, calls, meetings }) => (
                  <tr key={u.id}>
                    <td>
                      <span className="row">
                        <Avatar name={u.name} /> <b>{u.name}</b>
                      </span>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.phone}</td>
                    <td>{u.role === 'admin' ? 'Admin' : 'Call center'}</td>
                    <td>
                      <span className="badge">
                        <span className="dot" style={{ background: u.active ? '#0ca30c' : '#898781' }} />
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{leads}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{calls}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{meetings}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEdit(u)}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn" title="Move all leads to another employee" disabled={!leads} onClick={() => setReassign(u)}>
                        <ArrowRightLeft size={15} />
                      </button>
                      <button className="icon-btn" title="Delete" onClick={() => remove(u, leads)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <UserForm initial={edit} onClose={() => setEdit(null)} />}
      {reassign && <ReassignModal from={reassign} onClose={() => setReassign(null)} />}
    </>
  );
}

function UserForm({ initial, onClose }) {
  const { state, user: me, actions } = useStore();
  const isNew = !initial.id;
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', role: 'agent', active: true, ...initial, ...(isNew ? {} : { password: '' }) });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!f.name.trim() || !f.email.trim()) return setErr('Name and email are required');
    const clash = state.users.find((u) => u.email.toLowerCase() === f.email.trim().toLowerCase() && u.id !== initial.id);
    if (clash) return setErr('Another account already uses this email');
    if (isNew && f.password.length < 6) return setErr('Password must be at least 6 characters');
    if (!isNew && f.password && f.password.length < 6) return setErr('Password must be at least 6 characters');
    if (initial.id === me.id && (!f.active || f.role !== 'admin')) return setErr("You can't deactivate or demote your own account");
    const data = { name: f.name.trim(), email: f.email.trim(), phone: f.phone, role: f.role, active: f.active };
    if (f.password) data.password = f.password;
    isNew ? actions.addUser(data) : actions.updateUser(initial.id, data);
    onClose();
  };

  return (
    <Modal
      title={isNew ? 'Add employee' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>
            {isNew ? <><Plus size={15} /> Add</> : 'Save'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field full">
          <span>Full name *</span>
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Email (used to log in) *</span>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label className="field">
          <span>{isNew ? 'Password *' : 'New password (leave empty to keep)'}</span>
          <input className="input" type="text" value={f.password} onChange={(e) => set('password', e.target.value)} />
        </label>
        <label className="field">
          <span>Role</span>
          <select className="select" value={f.role} onChange={(e) => set('role', e.target.value)}>
            <option value="agent">Call center sales</option>
            <option value="admin">Admin (sees everything)</option>
          </select>
        </label>
        <label className="check full">
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          Active (can log in)
        </label>
      </div>
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function ReassignModal({ from, onClose }) {
  const { state, actions } = useStore();
  const targets = state.users.filter((u) => u.id !== from.id && u.active);
  const [to, setTo] = useState(targets[0]?.id ?? '');
  return (
    <Modal
      title={`Move ${from.name}'s leads`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!to} onClick={() => { actions.reassignLeads(from.id, to); onClose(); }}>
            Move leads
          </button>
        </>
      }
    >
      <label className="field">
        <span>Move all leads and upcoming meetings to</span>
        <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
          {targets.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>
    </Modal>
  );
}
