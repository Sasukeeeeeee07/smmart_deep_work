import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import SelectMode from './pages/SelectMode';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Tasks from './pages/Tasks';
import Devices from './pages/Devices';
import Notifications from './pages/Notifications';
import ActivityPage from './pages/Activity';
import DeepWorkPage from './pages/DeepWork';
import Profile from './pages/Profile';
import SettingsPage from './pages/Settings';
import RewardsPage from './pages/Rewards';
import Penalty from './pages/Penalty';
import ModeratorConfig from './pages/ModeratorConfig';
import NotFound from './pages/NotFound';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/select-mode" element={<SelectMode />} />
        
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/deepwork" element={<DeepWorkPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/rewards" element={<RewardsPage />} />
          <Route path="/penalty" element={<Penalty />} />
          <Route path="/notifications" element={<Notifications />} />
          
          {/* Secret / URL-only Autonomous AI Moderator Configuration */}
          <Route path="/moderator-config" element={<ModeratorConfig />} />
          <Route path="/ai-moderator" element={<ModeratorConfig />} />
        </Route>
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
