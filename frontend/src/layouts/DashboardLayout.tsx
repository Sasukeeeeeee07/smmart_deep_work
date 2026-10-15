import { useState, useEffect } from 'react';
import { Navigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Monitor, LogOut, ClipboardList,
  Bell, Activity, Timer, ChevronRight
} from 'lucide-react';
import { notificationService, deviceService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';

const navItems = [
  { to: '/',              icon: LayoutDashboard, label: 'Overview',      roles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'USER'] },
  { to: '/deepwork',      icon: Timer,           label: 'Deep Work',     roles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'USER'] },
  { to: '/devices',       icon: Monitor,         label: 'Devices',       roles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'USER'] },
  { to: '/tasks',         icon: ClipboardList,   label: 'Tasks',         roles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'USER'] },
  { to: '/employees',     icon: Users,           label: 'Team',          roles: ['ADMIN', 'MANAGER'] },
  { to: '/activity',      icon: Activity,        label: 'Sensor Log',    roles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'USER'] },
  { to: '/notifications', icon: Bell,            label: 'Notifications', roles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'USER'] },
] as const;

const DashboardLayout = () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const location = useLocation();

  const [unreadCount, setUnreadCount]   = useState(0);
  const [lockedDevice, setLockedDevice] = useState<any>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // Close mobile nav on route change
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
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

  const role = (user?.role || 'EMPLOYEE').toUpperCase();
  const visible = navItems.filter(item => item.roles.includes(role as any));

  // Current page label for mobile header
  const currentItem = visible.find(i => i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to));

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div
      style={{ height: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col md:flex-row overflow-hidden"
    >
      {/* ── Sidebar (Desktop) ─────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{
          width: 220,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--forest)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.9"/>
              <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="2" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="9" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
              smmart
            </p>
            <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--ink-4)' }}>
              deep work
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visible.map(({ to, icon: Icon, label }) => {
            const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            const badge = to === '/notifications' ? unreadCount : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group"
                style={({ isActive: ia }) => ({
                  background: ia ? 'rgba(66, 84, 67, 0.1)' : 'transparent',
                  color: ia ? 'var(--forest)' : 'var(--ink-3)',
                  fontWeight: ia ? '600' : '400',
                })}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Icon size={16} className="shrink-0 transition-transform duration-150" />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(182, 83, 75, 0.12)',
                      color: 'var(--error)',
                      fontSize: 10,
                    }}
                  >
                    {badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div
          className="p-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
            <div
              className="flex items-center justify-center shrink-0 text-xs font-bold"
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(66, 84, 67, 0.12)',
                color: 'var(--forest)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>
                {user?.name || 'User'}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                {user?.role || 'Member'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg transition-colors"
              title="Sign out"
              style={{ color: 'var(--ink-4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Top Bar ────────────────────────────────── */}
      <div
        className="flex md:hidden items-center justify-between px-4 py-3 shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--forest)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.9"/>
              <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="2" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="9" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
            {currentItem?.label || 'Overview'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <NavLink to="/notifications" className="relative p-2">
              <Bell size={18} style={{ color: 'var(--ink-3)' }} />
              <span
                className="absolute top-1 right-1 w-2 h-2 rounded-full border-2"
                style={{ background: 'var(--error)', borderColor: 'var(--surface)' }}
              />
            </NavLink>
          )}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="p-2 rounded-lg"
            style={{ background: mobileNavOpen ? 'var(--surface-2)' : 'transparent', color: 'var(--ink-2)' }}
          >
            <div className="w-5 flex flex-col gap-1 items-end">
              <span className="block h-px w-5 rounded" style={{ background: 'currentColor' }} />
              <span className="block h-px w-3 rounded" style={{ background: 'currentColor' }} />
              <span className="block h-px w-5 rounded" style={{ background: 'currentColor' }} />
            </div>
          </button>
        </div>
      </div>

      {/* ── Mobile Nav Drawer ─────────────────────────────── */}
      {mobileNavOpen && (
        <div
          className="md:hidden px-3 pt-2 pb-4 space-y-0.5 shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          {visible.map(({ to, icon: Icon, label }) => {
            const badge = to === '/notifications' ? unreadCount : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
                style={({ isActive }) => ({
                  background: isActive ? 'rgba(66, 84, 67, 0.1)' : 'transparent',
                  color: isActive ? 'var(--forest)' : 'var(--ink-2)',
                  fontWeight: isActive ? '600' : '400',
                })}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span style={{ color: 'var(--error)', fontSize: 11, fontWeight: 700 }}>{badge}</span>
                )}
                <ChevronRight size={14} style={{ color: 'var(--ink-4)' }} />
              </NavLink>
            );
          })}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm"
              style={{ color: 'var(--error)' }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────── */}
      <main
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ background: 'var(--canvas)', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="px-6 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
