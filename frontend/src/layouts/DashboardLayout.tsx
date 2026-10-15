import { useState, useEffect } from 'react';
import { Navigate, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut, Bell, Timer, Building2, User as UserIcon
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

  const mode = localStorage.getItem('workspaceMode') || 'entrepreneur';

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

  const isDeepWork = location.pathname.startsWith('/deepwork');

  return (
    <div
      style={{ minHeight: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col"
    >
      {/* ── Minimalist Top Header (Side menu hidden as requested) ── */}
      <header
        className="sticky top-0 z-40 px-5 md:px-8 py-3.5 flex items-center justify-between shrink-0"
        style={{
          background: 'rgba(255, 254, 250, 0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: Brand & Mode badge */}
        <div className="flex items-center gap-4">
          <Link to="/select-mode" className="flex items-center gap-2.5 group">
            <div
              className="flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
              style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--forest)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.95"/>
                <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.55"/>
                <rect x="2" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.55"/>
                <rect x="9" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.95"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-sm leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                smmart
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--ink-4)', fontSize: 10 }}>
                deep work
              </p>
            </div>
          </Link>

          <div className="hidden sm:block h-4 w-px" style={{ background: 'var(--border)' }} />

          {/* Mode Pill & Switcher */}
          <Link
            to="/select-mode"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
            style={{
              background: mode === 'entrepreneur' ? 'rgba(66, 84, 67, 0.08)' : 'rgba(196, 127, 97, 0.1)',
              color: mode === 'entrepreneur' ? 'var(--forest)' : 'var(--terra)',
              border: `1px solid ${mode === 'entrepreneur' ? 'rgba(66, 84, 67, 0.2)' : 'rgba(196, 127, 97, 0.25)'}`,
            }}
            title="Click to switch between Entrepreneur & Individual mode"
          >
            {mode === 'entrepreneur' ? <Building2 size={12} /> : <UserIcon size={12} />}
            <span className="capitalize">{mode} Mode</span>
            <span className="text-xs opacity-60 ml-0.5 font-normal hover:underline">• Switch</span>
          </Link>
        </div>

        {/* Center: Quick navigation links */}
        <nav className="flex items-center gap-1 sm:gap-2 text-xs font-medium">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: location.pathname === '/' || location.pathname === '/dashboard' ? 'var(--surface-2)' : 'transparent',
              color: location.pathname === '/' || location.pathname === '/dashboard' ? 'var(--ink)' : 'var(--ink-3)',
              fontWeight: location.pathname === '/' || location.pathname === '/dashboard' ? 600 : 400,
            }}
          >
            Dashboard
          </Link>
          <Link
            to="/deepwork"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: isDeepWork ? 'rgba(66, 84, 67, 0.1)' : 'transparent',
              color: isDeepWork ? 'var(--forest)' : 'var(--ink-3)',
              fontWeight: isDeepWork ? 600 : 400,
            }}
          >
            <Timer size={13} />
            <span>Deep Work</span>
          </Link>
        </nav>

        {/* Right: Notifications, User & Logout */}
        <div className="flex items-center gap-3">
          <Link
            to="/notifications"
            className="relative p-2 rounded-lg transition-colors"
            style={{ color: 'var(--ink-3)' }}
            title="Notifications"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: 'var(--error)' }}
              />
            )}
          </Link>

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
            title={user?.name || user?.email}
          >
            {initials}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
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
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Container (Full Width, Centered) ── */}
      <main
        className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
