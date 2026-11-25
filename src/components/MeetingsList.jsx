import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, CalendarX } from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import LeadModal from './LeadModal';
import { Empty } from './ui';
import { fmtDateTime, inRange, monthRange } from '../lib/utils';

/**
 * Meetings table split into upcoming and past.
 * monthKey: limit to that month (dashboard); agentId: lock to one employee.
 */
export default function MeetingsList({ monthKey, agentId, allowAgentFilter }) {
  const { state, actions } = useStore();
  const { userById, leadById, agents } = useLookups();
  const [agent, setAgent] = useState('all');
  const [status, setStatus] = useState('all');
  const [openLead, setOpenLead] = useState(null);

  const list = useMemo(() => {
    const range = monthKey ? monthRange(monthKey) : null;
    const who = agentId ?? (agent === 'all' ? null : agent);
    return state.meetings
      .filter((m) => !who || m.agentId === who)
      .filter((m) => !range || inRange(m.scheduledAt, range))
      .filter((m) => status === 'all' || m.status === status);
  }, [state.meetings, monthKey, agentId, agent, status]);

  const now = new Date().toISOString();
  const upcoming = list.filter((m) => m.scheduledAt >= now && m.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = list.filter((m) => !upcoming.includes(m)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const counts = {
    done: list.filter((m) => m.status === 'done').length,
    scheduled: list.filter((m) => m.status === 'scheduled').length,
    cancelled: list.filter((m) => m.status === 'cancelled').length,
  };

  const table = (rows, empty) =>
    rows.length === 0 ? (
      <div className="muted small card-body">{empty}</div>
    ) : (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date & time</th>
              <th>Lead</th>
              <th>Phone</th>
              <th>Title</th>
              {!agentId && <th>Employee</th>}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const lead = leadById[m.leadId];
              return (
                <tr key={m.id}>
                  <td>{fmtDateTime(m.scheduledAt)}</td>
                  <td>{lead ? <a href="#" onClick={(e) => { e.preventDefault(); setOpenLead(lead.id); }}>{lead.name}</a> : <span className="muted">(deleted)</span>}</td>
                  <td>{lead?.phone}</td>
                  <td className="wrap">
                    {m.title}
                    {m.notes && <div className="small muted">{m.notes}</div>}
                  </td>
                  {!agentId && <td>{userById[m.agentId]?.name ?? '—'}</td>}
                  <td>
                    <select className="select" style={{ width: 120 }} value={m.status} onChange={(e) => actions.updateMeeting(m.id, { status: e.target.value })}>
                      <option value="scheduled">Scheduled</option>
                      <option value="done">Done</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap">
        <span className="badge"><CalendarClock size={13} /> {counts.scheduled} scheduled</span>
        <span className="badge"><CalendarCheck size={13} /> {counts.done} done</span>
        <span className="badge"><CalendarX size={13} /> {counts.cancelled} cancelled</span>
        <span className="spacer" />
        {allowAgentFilter && !agentId && (
          <select className="select no-print" style={{ width: 180 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">All employees</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <select className="select no-print" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {list.length === 0 ? (
        <div className="card">
          <Empty icon={CalendarClock} title="No meetings">
            Schedule meetings from a lead's "Meetings" tab.
          </Empty>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-head"><h3>Upcoming meetings ({upcoming.length})</h3></div>
            <div className="card-body" style={{ padding: '8px 0 0' }}>{table(upcoming, 'Nothing upcoming.')}</div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Past & completed ({past.length})</h3></div>
            <div className="card-body" style={{ padding: '8px 0 0' }}>{table(past, 'No past meetings.')}</div>
          </div>
        </>
      )}
      {openLead && <LeadModal leadId={openLead} onClose={() => setOpenLead(null)} />}
    </div>
  );
}
