import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, ArrowRight, Sparkles, Shield, BarChart3, Clock, LogOut } from 'lucide-react';

export default function SelectMode() {
  const navigate = useNavigate();
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const [hovered, setHovered] = useState<'entrepreneur' | 'individual' | null>(null);

  const handleSelect = (mode: 'entrepreneur' | 'individual') => {
    localStorage.setItem('workspaceMode', mode);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspaceMode');
    navigate('/login');
  };

  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  return (
    <div
      className="min-h-screen flex flex-col justify-between p-6 md:p-10 select-none"
      style={{ background: 'var(--canvas)' }}
    >
      {/* ── Top Bar ────────────────────────────────────────── */}
      <header className="flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--forest)' }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.95"/>
              <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.55"/>
              <rect x="2" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.55"/>
              <rect x="9" y="9" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
              smmart
            </p>
            <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--ink-4)' }}>
              deep work os
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: 'var(--ink-4)' }}>
            Signed in as <strong style={{ color: 'var(--ink-2)' }}>{user?.email || 'admin@smmart.com'}</strong>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--ink-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Center Content ─────────────────────────────────── */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8">
        <div className="text-center mb-10 md:mb-14">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ background: 'rgba(66, 84, 67, 0.08)', color: 'var(--forest)', border: '1px solid rgba(66, 84, 67, 0.2)' }}
          >
            <Sparkles size={12} />
            Workspace Selection
          </span>
          <h1
            className="text-3xl md:text-5xl font-bold tracking-tight mb-3"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
          >
            Welcome back, {firstName}.
          </h1>
          <p className="text-sm md:text-base max-w-lg mx-auto" style={{ color: 'var(--ink-3)' }}>
            Select how you would like to experience your SmartDesk workspace today.
          </p>
        </div>

        {/* ── Two Mode Cards ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
          {/* Card 1: Entrepreneur */}
          <div
            onMouseEnter={() => setHovered('entrepreneur')}
            onMouseLeave={() => setHovered(null)}
            className="card relative flex flex-col justify-between p-7 md:p-9 cursor-pointer transition-all duration-200"
            style={{
              background: 'var(--surface)',
              border: hovered === 'entrepreneur' ? '1.5px solid var(--forest)' : '1px solid var(--border)',
              boxShadow: hovered === 'entrepreneur' ? 'var(--shadow-xl)' : 'var(--shadow-sm)',
              transform: hovered === 'entrepreneur' ? 'translateY(-4px)' : 'none',
              minHeight: 340,
            }}
            onClick={() => handleSelect('entrepreneur')}
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 48, height: 48, background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)' }}
                >
                  <Building2 size={24} />
                </div>
                <span
                  className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  Organization
                </span>
              </div>

              <h2
                className="text-2xl font-bold mb-2"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
              >
                Entrepreneur
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
                Lead your team, manage connected SmartDesk hardware, and track organization-wide focus rhythms and break moderation.
              </p>

              <div className="space-y-2 mb-6 text-xs" style={{ color: 'var(--ink-3)' }}>
                <div className="flex items-center gap-2">
                  <Shield size={14} style={{ color: 'var(--forest)' }} />
                  <span>Fleet overview & real-time radar desk feeds</span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={14} style={{ color: 'var(--forest)' }} />
                  <span>Team productivity metrics & monthly trends</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} style={{ color: 'var(--forest)' }} />
                  <span>Lockout prevention & supervisor alarms</span>
                </div>
              </div>
            </div>

            {/* Hover Action Button */}
            <div
              className="pt-4 transition-all duration-200 flex items-center justify-center"
              style={{
                opacity: hovered === 'entrepreneur' ? 1 : 0.75,
                transform: hovered === 'entrepreneur' ? 'translateY(0)' : 'translateY(2px)',
              }}
            >
              <button
                className="w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: hovered === 'entrepreneur' ? 'var(--forest)' : 'var(--surface-2)',
                  color: hovered === 'entrepreneur' ? '#ffffff' : 'var(--ink)',
                  border: hovered === 'entrepreneur' ? '1px solid transparent' : '1px solid var(--border)',
                  boxShadow: hovered === 'entrepreneur' ? '0 4px 12px rgba(66, 84, 67, 0.25)' : 'none',
                }}
              >
                <span>Open Dashboard</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Card 2: Individual */}
          <div
            onMouseEnter={() => setHovered('individual')}
            onMouseLeave={() => setHovered(null)}
            className="card relative flex flex-col justify-between p-7 md:p-9 cursor-pointer transition-all duration-200"
            style={{
              background: 'var(--surface)',
              border: hovered === 'individual' ? '1.5px solid var(--terra)' : '1px solid var(--border)',
              boxShadow: hovered === 'individual' ? 'var(--shadow-xl)' : 'var(--shadow-sm)',
              transform: hovered === 'individual' ? 'translateY(-4px)' : 'none',
              minHeight: 340,
            }}
            onClick={() => handleSelect('individual')}
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 48, height: 48, background: 'rgba(196, 127, 97, 0.12)', color: 'var(--terra)' }}
                >
                  <User size={24} />
                </div>
                <span
                  className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  Personal
                </span>
              </div>

              <h2
                className="text-2xl font-bold mb-2"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
              >
                Individual
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
                Protect your personal flow state, cultivate deep work consistency, and review your personal focus vs break patterns.
              </p>

              <div className="space-y-2 mb-6 text-xs" style={{ color: 'var(--ink-3)' }}>
                <div className="flex items-center gap-2">
                  <Sparkles size={14} style={{ color: 'var(--terra)' }} />
                  <span>Personal flow telemetry & presence detection</span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={14} style={{ color: 'var(--terra)' }} />
                  <span>Weekly focus streaks & monthly productivity ratio</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} style={{ color: 'var(--terra)' }} />
                  <span>Session countdown, extensions & self-ratings</span>
                </div>
              </div>
            </div>

            {/* Hover Action Button */}
            <div
              className="pt-4 transition-all duration-200 flex items-center justify-center"
              style={{
                opacity: hovered === 'individual' ? 1 : 0.75,
                transform: hovered === 'individual' ? 'translateY(0)' : 'translateY(2px)',
              }}
            >
              <button
                className="w-full py-3.5 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: hovered === 'individual' ? 'var(--terra)' : 'var(--surface-2)',
                  color: hovered === 'individual' ? '#ffffff' : 'var(--ink)',
                  border: hovered === 'individual' ? '1px solid transparent' : '1px solid var(--border)',
                  boxShadow: hovered === 'individual' ? '0 4px 12px rgba(196, 127, 97, 0.25)' : 'none',
                }}
              >
                <span>Open Dashboard</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="text-center text-xs" style={{ color: 'var(--ink-4)' }}>
        SmartDesk OS • Built for deep focus and sustainable productivity
      </footer>
    </div>
  );
}
