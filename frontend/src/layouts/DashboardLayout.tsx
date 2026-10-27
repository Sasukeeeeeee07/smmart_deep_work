import { useState, useEffect } from 'react';
import { Navigate, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LogOut, 
  Bell, 
  ArrowLeft, 
  Settings, 
  Award,
  LayoutDashboard,
  Timer,
  CheckSquare,
  User,
  Activity,
  Cpu,
  Users,
  Layers,
  X,
  PanelRightClose,
  PanelRightOpen
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
  const [sidebarOpen, setSidebarOpen]   = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen));
  }, [sidebarOpen]);

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

  const workspaceMode = localStorage.getItem('workspaceMode') || 'individual';
  const isIndividual = workspaceMode === 'individual';
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const navLinks = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Deep Work', path: '/deepwork', icon: Timer },
    { label: 'Tasks', path: '/tasks', icon: CheckSquare },
    { label: 'Rewards & Milestones', path: '/rewards', icon: Award },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Profile', path: '/profile', icon: User },
    ...(!isIndividual ? [
      { label: 'Activity Monitor', path: '/activity', icon: Activity },
      { label: 'Devices', path: '/devices', icon: Cpu },
      ...(isLeadership ? [{ label: 'Staff Members', path: '/employees', icon: Users }] : [])
    ] : []),
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined },
  ];

  return (
    <div
      style={{ minHeight: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col w-full max-w-full overflow-x-hidden"
    >
      {/* ── Minimalist Clean Header ── */}
      <header
        className="sticky top-0 z-50 px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between shrink-0 w-full max-w-full relative"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: Back Button */}
        <div className="flex items-center gap-2 sm:gap-3.5 z-10">
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

        {/* Right: Rewards, Settings, Notifications, Profile, Sign Out & Sidebar Toggle */}
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

          {/* Toggle Button for Right-Side Vertical Navigation Bar */}
          <button
            type="button"
            onClick={() => setSidebarOpen(prev => !prev)}
            className="p-2 rounded-xl transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-2xs ml-0.5"
            style={{
              borderColor: sidebarOpen ? 'var(--forest)' : 'var(--border)',
              background: sidebarOpen ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface)',
              color: sidebarOpen ? 'var(--forest)' : 'var(--ink)',
            }}
            title={sidebarOpen ? "Close side menu" : "Open side menu"}
            aria-label="Toggle side navigation menu"
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </header>

      {/* ── Main Layout Body with Content and Global Right-Side Navigation Bar ── */}
      <div className="flex-1 flex w-full max-w-full relative min-h-[calc(100vh-57px)]">
        {/* Main Content Area */}
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6 min-w-0 transition-all duration-300 w-full overflow-x-hidden">
          <Outlet />
        </main>

        {/* Backdrop on mobile (< lg screens) */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-[57px] bg-black/25 backdrop-blur-[2px] z-30 lg:hidden transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SLIM RIGHT-SIDE VERTICAL NAVIGATION BAR (Consistently Present Globally)
           ══════════════════════════════════════════════════════════════════ */}
        <aside
          className={`
            fixed lg:sticky top-[57px] right-0 h-[calc(100vh-57px)] z-40 lg:z-20
            flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out select-none
            ${
              sidebarOpen
                ? 'w-60 translate-x-0 opacity-100 border-l shadow-2xl lg:shadow-none'
                : 'w-0 translate-x-full lg:translate-x-0 lg:w-0 opacity-0 pointer-events-none border-l-0 overflow-hidden'
            }
          `}
          style={{
            background: 'rgba(255, 254, 250, 0.98)',
            backdropFilter: 'blur(16px)',
            borderColor: 'var(--border)',
          }}
          aria-label="Navigation Menu"
        >
          {/* Inner fixed-width wrapper to prevent layout wrap during width collapse */}
          <div className="w-60 h-full flex flex-col justify-between p-3.5 overflow-y-auto">
            {/* Top section: Header & Navigation Links */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
                  Menu
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-lg text-[var(--ink-3)] hover:text-[var(--forest)] hover:bg-stone-100 transition-colors cursor-pointer"
                  title="Close side menu"
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
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                        active
                          ? 'shadow-xs'
                          : 'hover:bg-[var(--surface-2)]'
                      }`}
                      style={{
                        background: active ? 'rgba(66, 84, 67, 0.12)' : 'transparent',
                        color: active ? 'var(--forest)' : 'var(--ink-3)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && item.badge > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold"
                          style={{ background: 'var(--error)' }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions: Mode Switch & Sign Out */}
            <div className="flex flex-col items-stretch gap-2 pt-3 border-t border-[var(--border)] w-full">
              <Link
                to="/select-mode"
                onClick={() => {
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all hover:border-[var(--forest)] hover:shadow-xs group cursor-pointer"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--forest)' }}
                title="Switch Workspace Mode"
              >
                <span className="flex items-center gap-2">
                  <Layers size={16} />
                  <span>Switch Mode</span>
                </span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[rgba(66,84,67,0.1)]">
                  {workspaceMode === 'entrepreneur' ? 'Entr.' : 'Indiv.'}
                </span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[rgba(182,83,75,0.1)] hover:text-[var(--error)] text-left w-full"
                style={{ color: 'var(--ink-2)' }}
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
