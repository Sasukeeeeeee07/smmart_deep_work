import { useState, useEffect } from 'react';
import { Navigate, Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Monitor, LogOut, ClipboardList, Bell, Activity, Timer, Sun, Moon } from 'lucide-react';
import { notificationService } from '../services/api';

const DashboardLayout = () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    const fetchCount = async () => {
      try { setUnreadCount(await notificationService.getUnreadCount()); } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const [isLight, setIsLight] = useState(() => {
    return localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLight]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Redirect EMPLOYEE users away from the main dashboard to their tasks
  if (user?.role === 'EMPLOYEE' && window.location.pathname === '/') {
    return <Navigate to="/tasks" replace />;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-surface border-r border-surface-light flex flex-col shrink-0 transition-colors duration-300">
        <div className="p-6 border-b border-surface-light transition-colors duration-300">
          <h1 className="text-xl font-bold text-primary tracking-tight">smmart deep work</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {([
            { to: '/',               icon: LayoutDashboard, label: 'Dashboard',     badge: 0,           roles: ['ADMIN', 'MANAGER'] },
            { to: '/employees',      icon: Users,           label: 'Staff & Users', badge: 0,           roles: ['ADMIN', 'MANAGER'] },
            { to: '/tasks',          icon: ClipboardList,   label: 'Tasks',         badge: 0,           roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
            { to: '/devices',        icon: Monitor,         label: 'Devices',       badge: 0,           roles: ['ADMIN'] },
            { to: '/activity',       icon: Activity,        label: 'Activity',      badge: 0,           roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
            { to: '/deepwork',       icon: Timer,           label: 'Deep Work',     badge: 0,           roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
            { to: '/notifications',  icon: Bell,            label: 'Notifications', badge: unreadCount, roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
          ] as const)
          .filter(item => item.roles.includes(user?.role || 'EMPLOYEE'))
          .map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
                  isActive
                    ? 'text-white bg-primary border border-primary/40 shadow-sm'
                    : 'text-text-muted hover:text-text-main hover:bg-surface-light/50'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/30">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-light flex flex-col gap-2 transition-colors duration-300">
          <button 
            onClick={() => setIsLight(!isLight)}
            className="flex items-center space-x-3 px-4 py-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-light/50 transition-colors w-full"
          >
            {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            <span className="text-sm font-medium">{isLight ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          <div className="flex items-center space-x-3 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 text-primary font-bold shrink-0">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-text-main truncate">{user?.name}</p>
              <p className="text-xs text-text-muted truncate">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-text-muted hover:text-red-500 transition-colors shrink-0">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className="flex-1 p-6 md:p-8 overflow-y-auto overscroll-y-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
