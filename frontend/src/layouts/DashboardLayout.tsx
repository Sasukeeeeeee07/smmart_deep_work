import { useState, useEffect } from 'react';
import { Navigate, Outlet, Link, useNavigate } from 'react-router-dom';
import { LogOut, Bell, ArrowLeft, Coins } from 'lucide-react';
import { notificationService, deviceService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';

export default function DashboardLayout() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount]   = useState(0);
  const [lockedDevice, setLockedDevice] = useState<any>(null);

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

  return (
    <div
      style={{ minHeight: '100dvh', background: 'var(--canvas)' }}
      className="flex flex-col w-full"
    >
      {/* ── Minimalist Clean Header ── */}
      <header
        className="sticky top-0 z-40 px-5 md:px-8 py-3.5 flex items-center justify-between shrink-0 w-full"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: Back Button & Brand Logo */}
        <div className="flex items-center gap-3.5">
          <button
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
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <Link to="/select-mode" className="flex items-center gap-2.5 group">
            <img
              src="/smmart-logo.png"
              alt="smmart"
              className="h-8 md:h-9 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <div className="hidden sm:block">
              <p className="font-bold text-sm leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                smmart
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--ink-4)', fontSize: 10 }}>
                deep work
              </p>
            </div>
          </Link>
        </div>

        {/* Right: Settings/SDW Points, Notifications, User & Logout */}
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="p-2 rounded-lg transition-colors hover:text-[var(--forest)]"
            style={{ color: 'var(--ink-3)' }}
            title="Settings & SDW Points Tracker"
          >
            <Coins size={16} />
          </Link>

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

      {/* ── Main Content Container (Covers Entire Page Width) ── */}
      <main
        className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6 w-full"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
