import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './store/StoreContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyDashboard from './pages/MyDashboard';
import Pipeline from './pages/Pipeline';
import Leads from './pages/Leads';
import Meetings from './pages/Meetings';
import Import from './pages/Import';
import Employees from './pages/Employees';
import Settings from './pages/Settings';
import Setup from './pages/Setup';

function RequireAuth({ children }) {
  const { user } = useStore();
  return user ? children : <Navigate to="/login" replace />;
}

function AdminOnly({ children }) {
  const { user } = useStore();
  return user.role === 'admin' ? children : <Navigate to="/" replace />;
}

function Home() {
  const { user } = useStore();
  return user.role === 'admin' ? <Dashboard /> : <MyDashboard />;
}

function AppRoutes() {
  const { state, mode, health } = useStore();
  if (!state) return <div className="empty">Loading…</div>;
  if (mode === 'remote' && !(health?.db && health?.session)) return <Setup health={health} />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="pipeline/:ownerId" element={<Pipeline />} />
        <Route path="leads" element={<Leads />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="import" element={<Import />} />
        <Route path="employees" element={<AdminOnly><Employees /></AdminOnly>} />
        <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </StoreProvider>
  );
}
