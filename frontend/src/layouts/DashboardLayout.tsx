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
  Layers
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
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
    { label: 'Rewards & Milestones', path: '/rewards', icon: Award },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Tasks', path: '/tasks', icon: CheckSquare },
    { label: 'Activity Logs', path: '/activity', icon: Activity },
    { label: 'Devices', path: '/devices', icon: Cpu },
    { label: 'Profile', path: '/profile', icon: User },
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

        {/* Right: Rewards, Settings, Notifications, User & Hamburger Toggle */}
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

          {/* Hamburger Menu Toggle (opens and closes menu when clicked on all screens) */}
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            className="p-2 rounded-lg transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-2xs"
            style={{
              borderColor: menuOpen ? 'var(--forest)' : 'var(--border)',
              background: menuOpen ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface)',
              color: menuOpen ? 'var(--forest)' : 'var(--ink)',
            }}
            title={menuOpen ? 'Close menu' : 'Open menu'}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Backdrop to close menu when clicking outside */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 top-[57px] bg-black/25 backdrop-blur-[2px] z-40 transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* ── Navigation Menu (Opens and Closes when Hamburger is Clicked) ── */}
      {menuOpen && (
        <div 
          className="fixed inset-x-0 top-[57px] z-50 p-4 sm:p-6 border-b shadow-xl animate-fade-in space-y-4"
          style={{ 
            background: 'rgba(255, 254, 250, 0.98)', 
            backdropFilter: 'blur(16px)', 
            borderColor: 'var(--border)' 
          }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <p className="text-xs font-bold text-[var(--ink)]">{user?.name || 'Workspace User'}</p>
              <p className="text-xs text-[var(--ink-3)]">{user?.email}</p>
            </div>
            <Link
              to="/select-mode"
              onClick={() => setMenuOpen(false)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:border-[var(--forest)] shadow-2xs"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--forest)' }}
            >
              <Layers size={14} />
              <span>Switch Mode</span>
            </Link>
          </div>

          <nav className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
            {navLinks.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    active
                      ? 'bg-[var(--forest)] text-white shadow-2xs'
                      : 'bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="max-w-7xl mx-auto pt-2 border-t border-[var(--border)] flex justify-between items-center">
            <span className="text-xs text-[var(--ink-4)]">
              &copy; {new Date().getFullYear()} smmart Desk
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg text-rose-700 bg-rose-50 border border-rose-200 transition-colors hover:bg-rose-100 cursor-pointer"
            >
              <LogOut size={13} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content Container ── */}
      <main
        className="flex-1 px-4 py-5 md:px-8 md:py-6 w-full max-w-full overflow-x-hidden"
      >
        <div className="w-full max-w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
