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
  const [sidebarOpen, setSidebarOpen]   = useState<boolean>(() => {
    const saved = localStorage.getItem('sidebarOpen');
    if (saved !== null) return saved === 'true';
    return window.innerWidth >= 1024;
  });

  // Close mobile sidebar on route change
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem('sidebarOpen', String(next));
      return next;
    });
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
    { label: 'Activity Logs', path: '/activity', icon: Activity },
    { label: 'Devices', path: '/devices', icon: Cpu },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div
      style={{ minHeight: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col w-full max-w-full overflow-x-hidden"
    >
      {/* ── Minimalist Clean Header with Global Hamburger Toggle ── */}
      <header
        className="sticky top-0 z-40 px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between shrink-0 w-full max-w-full relative"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: Hamburger Menu Button & Back Button */}
        <div className="flex items-center gap-2 sm:gap-3 z-10">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center p-2 rounded-xl transition-all cursor-pointer border hover:border-[var(--forest)] hover:shadow-xs"
            style={{
              color: sidebarOpen ? 'var(--forest)' : 'var(--ink)',
              borderColor: sidebarOpen ? 'var(--forest)' : 'var(--border)',
              background: sidebarOpen ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface)',
            }}
            title={sidebarOpen ? 'Close side menu' : 'Open side menu'}
            aria-label="Toggle side menu"
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/dashboard');
              }
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border hover:shadow-xs hover:border-[var(--forest)]"
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

        {/* Right: Rewards, Settings, Notifications & User Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 z-10">
          <Link
            to="/rewards"
            className="p-2 rounded-lg transition-colors hover:text-amber-600 hover:bg-amber-50/50 cursor-pointer"
            style={{ color: 'var(--ink-3)' }}
            title="Rewards & Milestones"
            aria-label="Rewards & Milestones"
          >
            <Award size={18} />
          </Link>

          <Link
            to="/settings"
            className="p-2 rounded-lg transition-colors hover:text-[var(--forest)] hover:bg-slate-100/50 cursor-pointer"
            style={{ color: 'var(--ink-3)' }}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </Link>

          <Link
            to="/notifications"
            className="relative p-2 rounded-lg transition-colors hover:text-[var(--forest)] hover:bg-slate-100/50 cursor-pointer"
            style={{ color: 'var(--ink-3)' }}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: 'var(--error)' }}
              />
            )}
          </Link>

          <Link
            to="/profile"
            className="flex items-center justify-center shrink-0 text-xs font-bold transition-transform hover:scale-105"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(66, 84, 67, 0.12)',
              color: 'var(--forest)',
              fontFamily: 'DM Sans, sans-serif',
            }}
            title={user?.name || user?.email || 'Profile'}
            aria-label="Profile"
          >
            {initials}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--ink-4)', border: '1px solid var(--border)', background: 'var(--surface)' }}
            title="Sign out"
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--error)';
              e.currentTarget.style.borderColor = 'var(--error)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--ink-4)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Main Layout Body: Collapsible Sidebar + Page Content ── */}
      <div className="flex flex-1 relative w-full overflow-x-hidden min-h-[calc(100dvh-57px)]">
        {/* Mobile Backdrop Overlay when Sidebar is open */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-[57px] bg-black/30 backdrop-blur-xs z-40 md:hidden transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* ── Global Side Menu Bar (Collapsible with Hamburger) ── */}
        <aside
          className={`
            fixed md:sticky top-[57px] left-0 h-[calc(100dvh-57px)] z-50 md:z-30
            flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out
            ${
              sidebarOpen
                ? 'w-64 translate-x-0 shadow-2xl md:shadow-none'
                : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:pointer-events-none'
            }
          `}
          style={{
            background: 'rgba(255, 254, 250, 0.98)',
            backdropFilter: 'blur(16px)',
            borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
          }}
        >
          {/* Inner fixed-width container to prevent text wrapping/distortion during width transitions */}
          <div className="w-64 h-full flex flex-col justify-between p-4 overflow-y-auto select-none">
            {/* Top Navigation Links */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
                  Menu
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-lg text-[var(--ink-3)] hover:text-[var(--error)] transition-colors cursor-pointer"
                  title="Close sidebar"
                >
                  <X size={15} />
                </button>
              </div>

              <nav className="space-y-1">
                {navLinks.map(item => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => {
                        if (window.innerWidth < 768) setSidebarOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        active
                          ? 'bg-[var(--forest)] text-white shadow-xs'
                          : 'text-[var(--ink)] hover:bg-[var(--surface-2)] hover:text-[var(--forest)]'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions: Mode Switch & User Card */}
            <div className="pt-4 border-t border-[var(--border)] space-y-3">
              <Link
                to="/select-mode"
                onClick={() => {
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:border-[var(--forest)] hover:shadow-xs group"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--forest)' }}
                title="Switch Workspace Mode"
              >
                <span className="flex items-center gap-2">
                  <Layers size={15} />
                  <span>Switch Mode</span>
                </span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </Link>

              <div className="flex items-center justify-between pt-1">
                <Link
                  to="/profile"
                  onClick={() => {
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className="flex items-center gap-2 overflow-hidden flex-1 group"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-transform group-hover:scale-105"
                    style={{ background: 'rgba(66, 84, 67, 0.12)', color: 'var(--forest)' }}
                  >
                    {initials}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold truncate max-w-[120px] text-[var(--ink)] group-hover:text-[var(--forest)]">
                      {user?.name || 'Workspace User'}
                    </p>
                    <p className="text-[10px] truncate max-w-[120px] text-[var(--ink-4)]">
                      {user?.email}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content Area ── */}
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6 w-full max-w-full overflow-x-hidden min-w-0 transition-all">
          <div className="w-full max-w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
