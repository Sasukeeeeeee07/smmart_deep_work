import { useState, useEffect } from 'react';
import { Navigate, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LogOut, 
  Bell, 
  ArrowLeft, 
  Settings, 
  Award, 
  Menu, 
  X, 
  LayoutDashboard, 
  Activity, 
  CheckSquare, 
  Cpu, 
  User, 
  Layers,
  ArrowRight
} from 'lucide-react';
import { notificationService, deviceService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';

export default function DashboardLayout() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCount, setUnreadCount]   = useState(0);
  const [lockedDevice, setLockedDevice] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close side menu on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const checkLockout = async () => {
    try {
      const devices = await deviceService.getAllDevices();
      const locked  = devices.find(
        (d: any) => d.isLockedOut && d.lockoutUntil && new Date(d.lockoutUntil) > new Date()
      );
      setLockedDevice(locked || null);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    if (!token) return;
    checkLockout();
    const iv = setInterval(checkLockout, 5000);
    return () => clearInterval(iv);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const fetch = async () => {
      try { setUnreadCount(await notificationService.getUnreadCount()); } catch {}
    };
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspaceMode');
    localStorage.removeItem('activeDeepworkSession');
    navigate('/login');
  };

  if (lockedDevice) {
    return (
      <LockoutScreen
        deviceUid={lockedDevice.uid}
        deviceName={lockedDevice.name}
        lockoutUntil={lockedDevice.lockoutUntil}
        reason={lockedDevice.lockoutReason}
        invalidCount={lockedDevice.invalidSessionCount}
        onUnlocked={() => { setLockedDevice(null); checkLockout(); }}
      />
    );
  }

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const navLinks = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Deep Work Session', path: '/deepwork', icon: Activity },
    { label: 'Tasks', path: '/tasks', icon: CheckSquare },
    { label: 'Rewards & Milestones', path: '/rewards', icon: Award },
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount > 0 ? String(unreadCount) : undefined },
    { label: 'Devices', path: '/devices', icon: Cpu },
    { label: 'Activity Logs', path: '/activity', icon: Activity },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div
      style={{ minHeight: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col w-full max-w-full overflow-x-hidden"
    >
      {/* ── Clean Header: Back Button (Left), Logo (Center), Hamburger Toggle (Right) ── */}
      <header
        className="sticky top-0 z-40 px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between shrink-0 w-full relative"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: Back Button Only */}
        <div className="flex items-center z-10">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/dashboard');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border hover:shadow-xs hover:border-[var(--forest)]"
            style={{
              color: 'var(--ink)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
            title="Go back to previous page"
            aria-label="Back"
          >
            <ArrowLeft size={14} />
            <span className="hidden xs:inline">Back</span>
          </button>
        </div>

        {/* Center: Aesthetic 'smmart deep work' Logo placed in the middle */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10 pointer-events-auto">
          <Link 
            to="/dashboard" 
            className="flex items-center group cursor-pointer transition-transform hover:scale-105 active:scale-95"
            title="smmart deep work"
          >
            <img
              src="/smmart-logo.png"
              alt="smmart deep work"
              loading="eager"
              decoding="async"
              className="h-8 sm:h-9 md:h-10 w-auto object-contain transition-transform"
            />
          </Link>
        </div>

        {/* Right: Hamburger Menu Button (Opens/Closes Side Menu) */}
        <div className="flex items-center z-10">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center p-2 rounded-xl transition-all cursor-pointer border hover:border-[var(--forest)] hover:shadow-xs relative"
            style={{
              color: sidebarOpen ? 'var(--forest)' : 'var(--ink)',
              borderColor: sidebarOpen ? 'var(--forest)' : 'var(--border)',
              background: sidebarOpen ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface)',
            }}
            title={sidebarOpen ? 'Close side menu' : 'Open side menu'}
            aria-label="Toggle side menu"
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            {unreadCount > 0 && !sidebarOpen && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>
      </header>

      {/* ── Slide-in Side Menu Bar on the Right ── */}
      {/* Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 top-[57px] bg-black/35 backdrop-blur-xs z-40 transition-opacity animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* Right-Side Drawer Panel */}
      <aside
        className={`
          fixed top-[57px] right-0 bottom-0 w-80 sm:w-88 z-50
          flex flex-col justify-between shrink-0 transition-transform duration-300 ease-out shadow-2xl
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}
        `}
        style={{
          background: 'rgba(255, 254, 250, 0.98)',
          backdropFilter: 'blur(20px)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col h-full justify-between p-5 overflow-y-auto select-none">
          {/* Top section: User Card + Close Button */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <Link
                to="/profile"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 overflow-hidden flex-1 group"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-transform group-hover:scale-105 shadow-xs"
                  style={{ background: 'rgba(66, 84, 67, 0.12)', color: 'var(--forest)' }}
                >
                  {initials}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold truncate max-w-[170px] text-[var(--ink)] group-hover:text-[var(--forest)]">
                    {user?.name || 'Workspace User'}
                  </p>
                  <p className="text-xs truncate max-w-[170px] text-[var(--ink-4)]">
                    {user?.email}
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
                title="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1 pt-1">
              {navLinks.map(item => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      active
                        ? 'bg-[var(--forest)] text-white shadow-xs'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-2)] hover:text-[var(--forest)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Actions: Mode Switch & Logout */}
          <div className="pt-4 border-t border-[var(--border)] space-y-3">
            <Link
              to="/select-mode"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all hover:border-[var(--forest)] hover:shadow-xs group"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--forest)' }}
              title="Switch Workspace Mode"
            >
              <span className="flex items-center gap-2.5">
                <Layers size={16} />
                <span>Switch Mode</span>
              </span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 transition-colors hover:bg-rose-100 cursor-pointer"
            >
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content Container (Full Width) ── */}
      <main className="flex-1 px-4 py-5 md:px-8 md:py-6 w-full max-w-full overflow-x-hidden min-w-0">
        <div className="w-full max-w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
