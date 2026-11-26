import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import EmployeeReport from '../components/EmployeeReport';
import LeadModal from '../components/LeadModal';
import { greeting, MonthPicker, StageBadge } from '../components/ui';
import { monthKey as currentMonth, monthLabel, timeAgo } from '../lib/utils';
import { t } from '../i18n';

const CLOSED_KINDS = ['registered', 'not_interested', 'blocked'];

export default function MyDashboard() {
  const { state, user } = useStore();
  const { stageById } = useLookups();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(null);

  // Open leads not contacted for 3+ days — the follow-up to-do list.
  const due = useMemo(() => {
    const cutoff = Date.now() - 3 * 864e5;
    return state.leads
      .filter((l) => l.ownerId === user.id && !CLOSED_KINDS.includes(stageById[l.stageId]?.kind))
      .filter((l) => !l.lastContactAt || new Date(l.lastContactAt).getTime() < cutoff)
      .sort((a, b) => (a.lastContactAt ?? '').localeCompare(b.lastContactAt ?? ''))
      .slice(0, 8);
  }, [state.leads, user.id, stageById]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {t('{greeting}, {name}', { greeting: greeting(), name: user.name.split(' ')[0] })} <span aria-hidden>👋</span>
          </h1>
          <p>{t("Here's how your follow-ups are going in {month}.", { month: monthLabel(month) })}</p>
        </div>
        <div className="spacer" />
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {due.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <h3>
              <Clock size={15} style={{ verticalAlign: -2 }} /> {t('Needs follow-up (no contact for 3+ days)')}
            </h3>
          </div>
          <div className="card-body" style={{ padding: '8px 0 0' }}>
            <table className="table">
              <tbody>
                {due.map((l) => (
                  <tr key={l.id} className="clickable" onClick={() => setOpen(l.id)}>
                    <td><b>{l.name}</b></td>
                    <td><bdi dir="ltr">{l.phone}</bdi></td>
                    <td><StageBadge stage={stageById[l.stageId]} /></td>
                    <td className="muted">{t('Last contact: {when}', { when: timeAgo(l.lastContactAt) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EmployeeReport userId={user.id} monthKey={month} />
      {open && <LeadModal leadId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
