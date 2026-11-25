import { useStore } from '../store/StoreContext';
import MeetingsList from '../components/MeetingsList';

export default function Meetings() {
  const { user } = useStore();
  const isAdmin = user.role === 'admin';
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Meetings</h1>
          <p>{isAdmin ? 'All meetings done and planned by the team.' : 'Meetings you did and will do.'}</p>
        </div>
      </div>
      <MeetingsList agentId={isAdmin ? undefined : user.id} allowAgentFilter={isAdmin} />
    </>
  );
}
