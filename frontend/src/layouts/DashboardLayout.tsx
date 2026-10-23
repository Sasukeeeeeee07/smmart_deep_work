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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
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
        className="sticky top-0 z-40 px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between shrink-0 w-full max-w-full"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left: Back Button, Brand Logo, & Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3.5">
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

          {/* Clickable Brand Logo */}
          <Link 
            to="/dashboard" 
            className="flex items-center gap-2 sm:gap-2.5 group cursor-pointer"
            title="Go to smmart dashboard"
          >
            <img
              src="/smmart-logo.png"
              alt="smmart logo"
              loading="lazy"
              decoding="async"
              className="h-8 md:h-9 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <div className="hidden sm:block">
              <p className="font-bold text-sm leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                smmart
              </p>
              <p className="text-xs leading-none mt-0.5 text-[var(--ink-4)] font-medium">
                deep work
              </p>
            </div>
          </Link>
        </div>

        {/* Right: Rewards, Settings, Notifications, User & Mobile Menu Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
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

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="p-2 rounded-lg transition-colors border md:hidden cursor-pointer"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
            title={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Navigation Drawer / Menu ── */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-x-0 top-[57px] z-50 md:hidden p-4 border-b shadow-lg animate-fade-in space-y-3"
          style={{ 
            background: 'rgba(255, 254, 250, 0.98)', 
            backdropFilter: 'blur(16px)', 
            borderColor: 'var(--border)' 
          }}
        >
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div>
              <p className="text-xs font-bold text-[var(--ink)]">{user?.name || 'Workspace User'}</p>
              <p className="text-xs text-[var(--ink-3)]">{user?.email}</p>
            </div>
            <Link
              to="/select-mode"
              className="text-xs font-bold px-2.5 py-1 rounded-md border flex items-center gap-1"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--forest)' }}
            >
              <Layers size={13} />
              <span>Switch Mode</span>
            </Link>
          </div>

          <nav className="grid grid-cols-2 gap-2 py-2">
            {navLinks.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all ${
                    active
                      ? 'bg-[var(--forest)] text-white shadow-2xs'
                      : 'bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] hover:bg-slate-100'
                  }`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-[var(--border)] flex justify-between items-center">
            <span className="text-xs text-[var(--ink-4)]">
              &copy; {new Date().getFullYear()} smmart
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-rose-700 bg-rose-50 border border-rose-200 cursor-pointer"
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

      {/* ── Global Footer ── */}
      <footer
        className="border-t border-[var(--border)] px-4 py-6 md:px-8 text-xs text-[var(--ink-3)] flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto w-full max-w-full"
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-2 text-center sm:text-left">
          <span className="font-semibold text-[var(--ink)]">smmart deep work</span>
          <span>&bull;</span>
          <span>&copy; {new Date().getFullYear()} All rights reserved.</span>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-center">
          <Link to="/dashboard" className="hover:text-[var(--forest)] transition-colors">Dashboard</Link>
          <Link to="/deepwork" className="hover:text-[var(--forest)] transition-colors">Deep Work</Link>
          <Link to="/rewards" className="hover:text-[var(--forest)] transition-colors">Rewards</Link>
          <Link to="/settings" className="hover:text-[var(--forest)] transition-colors">Settings</Link>
          <Link to="/profile" className="hover:text-[var(--forest)] transition-colors">Profile</Link>
        </div>
      </footer>
    </div>
  );
}
