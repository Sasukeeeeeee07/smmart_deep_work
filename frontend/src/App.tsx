import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Tasks from './pages/Tasks';
import Devices from './pages/Devices';
import Notifications from './pages/Notifications';
import ActivityPage from './pages/Activity';
import DeepWorkPage from './pages/DeepWork';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/deepwork" element={<DeepWorkPage />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
