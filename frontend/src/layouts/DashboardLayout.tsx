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
  ShieldAlert,
  Gavel,
  Users,
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
  const [strikeWarning, setStrikeWarning] = useState<{ uid: string; name: string; count: number } | null>(null);
  const [dismissedStrike, setDismissedStrike] = useState<string | null>(() => sessionStorage.getItem('dismissedStrike'));
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
      // Warn as a device nears the strike limit (7+ of 10 invalid sessions)
      const warn = devices
        .filter((d: any) => !d.isLockedOut && (d.invalidSessionCount || 0) >= 7)
        .sort((a: any, b: any) => (b.invalidSessionCount || 0) - (a.invalidSessionCount || 0))[0];
      setStrikeWarning(warn ? { uid: warn.uid, name: warn.name || warn.uid, count: warn.invalidSessionCount } : null);
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
  const isDashboard = location.pathname === '/' || location.pathname === '/dashboard';
  // The side menu carries the logo (as in the design); the header shows it only when the menu is hidden
  const showHeaderLogo = isDashboard || !sidebarOpen;

  const navLinks = [
    { label: 'Dashboard', tint: '#2F6FE4', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Deep Work', tint: '#3B6FD0', path: '/deepwork', icon: Timer },
    { label: 'Tasks', tint: '#1E6AE1', path: '/tasks', icon: CheckSquare },
    { label: 'Penalty', tint: '#D7262E', path: '/penalty', icon: Gavel },
    { label: 'Profile', tint: '#0EA5D9', path: '/profile', icon: User },
    ...(!isIndividual ? [
      { label: 'Activity Monitor', tint: '#2F6FE4', path: '/activity', icon: Activity },
      { label: 'Devices', tint: '#3B7BE8', path: '/devices', icon: Cpu },
      ...(isLeadership ? [{ label: 'Staff Members', tint: '#1E6AE1', path: '/employees', icon: Users }] : [])
    ] : []),
    { label: 'Notifications', tint: '#2F6FE4', path: '/notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined },
  ];

  return (
    <div
      style={{ minHeight: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col w-full max-w-full overflow-x-clip"
    >
      {/* ── Minimalist Clean Header ── */}
      <header
        className="sticky top-0 z-50 px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between shrink-0 w-full max-w-full relative"
        style={{
          background: 'rgba(247, 247, 248, 0.95)',
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
        <div className={`absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10 pointer-events-auto transition-opacity ${showHeaderLogo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={!showHeaderLogo}>
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
              background: 'rgba(11, 94, 215, 0.12)',
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

          {/* Toggle Button for Right-Side Vertical Navigation Bar (Hidden on Dashboard) */}
          {!isDashboard && (
            <button
              type="button"
              onClick={() => setSidebarOpen(prev => !prev)}
              className="p-2 rounded-xl transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-2xs ml-0.5"
              style={{
                borderColor: sidebarOpen ? 'var(--forest)' : 'var(--border)',
                background: sidebarOpen ? 'rgba(11, 94, 215, 0.08)' : 'var(--surface)',
                color: sidebarOpen ? 'var(--forest)' : 'var(--ink)',
              }}
              title={sidebarOpen ? "Close side menu" : "Open side menu"}
              aria-label="Toggle side navigation menu"
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          )}
        </div>
      </header>

      {/* ── Strike warning: shown from 7 of 10 invalid sessions ── */}
      {strikeWarning && dismissedStrike !== `${strikeWarning.uid}:${strikeWarning.count}` && (
        <div
          role="alert"
          className="px-4 sm:px-6 md:px-8 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold"
          style={{ background: strikeWarning.count >= 9 ? '#FDE2E2' : '#FFF1D6', color: strikeWarning.count >= 9 ? '#9B1C1C' : '#8A5A00', borderBottom: '1px solid var(--border)' }}
        >
          <span className="flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <span>
              Strike warning: {strikeWarning.name} has {strikeWarning.count} of 10 invalid sessions.{' '}
              {10 - strikeWarning.count === 1 ? '1 more' : `${10 - strikeWarning.count} more`} locks it for 48 hours. A valid session of 20+ minutes clears the strikes.
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              const key = `${strikeWarning.uid}:${strikeWarning.count}`;
              sessionStorage.setItem('dismissedStrike', key);
              setDismissedStrike(key);
            }}
            className="shrink-0 underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Layout Body with Content and Global Right-Side Navigation Bar ── */}
      <div className="flex-1 flex w-full max-w-full relative min-h-[calc(100vh-57px)]">
        {/* Main Content Area */}
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6 min-w-0 transition-all duration-300 w-full overflow-x-hidden">
          <Outlet />
        </main>

        {/* Backdrop on mobile (< lg screens) */}
        {!isDashboard && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-[57px] bg-black/25 backdrop-blur-[2px] z-30 lg:hidden transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SLIM RIGHT-SIDE VERTICAL NAVIGATION BAR (Consistently Present Globally, Hidden on Dashboard)
           ══════════════════════════════════════════════════════════════════ */}
        {!isDashboard && (
          <aside
            className={`
              fixed lg:sticky top-[57px] right-0 h-[calc(100vh-57px)] z-40 lg:z-20
              flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none
              ${
                sidebarOpen
                  ? 'w-[272px] max-w-[85vw] translate-x-0 opacity-100 shadow-2xl lg:shadow-none'
                  : 'w-0 translate-x-full lg:translate-x-0 lg:w-0 opacity-0 pointer-events-none overflow-hidden'
              }
            `}
            style={{ background: '#C9D4E0' }}
            aria-label="Navigation Menu"
          >
            {/* Inner fixed-width wrapper to prevent layout wrap during width collapse */}
            <div className="w-[272px] max-w-[85vw] h-full flex flex-col overflow-y-auto">
              <Link
                to="/dashboard"
                className="flex items-center justify-center pt-7 pb-6 shrink-0"
                title="smmart deep work"
                onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
              >
                <img src="/smmart-logo.png" alt="smmart deep work" className="w-[150px] h-auto object-contain" />
              </Link>

              <nav className="flex flex-col border-t" style={{ borderColor: 'rgba(30, 32, 36, 0.14)' }}>
                {navLinks.map(item => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                      className="side-nav-item"
                    >
                      <span className="flex items-center gap-4">
                        <Icon size={22} strokeWidth={1.8} style={{ color: item.tint }} />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && item.badge > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold not-italic"
                          style={{ background: 'var(--error)' }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto pb-6 pt-8 flex justify-center shrink-0">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="side-nav-item !w-auto !border-0 !py-2 !px-4 hover:!bg-transparent hover:underline"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
