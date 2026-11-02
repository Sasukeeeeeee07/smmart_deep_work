import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, Sparkles, Timer, ArrowRight } from 'lucide-react';
import { soundFX } from '../utils/sound';
import { sessionService } from '../services/api';

export default function SelectMode() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<'entrepreneur' | 'individual' | null>(null);
  const [motivationalNotice, setMotivationalNotice] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('activeDeepworkSession');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed && ['ACTIVE', 'BREAK', 'DYING'].includes(parsed.status)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => {
    document.title = 'Select Mode — smmart Desk';
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Poll for active deepwork session
  useEffect(() => {
    let mounted = true;
    const checkActiveSession = async () => {
      try {
        const live = await sessionService.getCurrentSession('ESP32-S3-01').catch(() => null);
        if (!mounted) return;
        if (live && ['ACTIVE', 'BREAK', 'DYING'].includes(live.status)) {
          setActiveSession(live);
          localStorage.setItem('activeDeepworkSession', JSON.stringify(live));
          return;
        }
        const res = await sessionService.getAllSessions(undefined).catch(() => null);
        const list = res?.sessions || (Array.isArray(res) ? res : []);
        const active = list.find((s: any) => ['ACTIVE', 'BREAK', 'DYING'].includes(s.status));
        if (mounted) {
          setActiveSession(active || null);
          if (active) {
            localStorage.setItem('activeDeepworkSession', JSON.stringify(active));
          } else {
            localStorage.removeItem('activeDeepworkSession');
          }
        }
      } catch {
        if (mounted) setActiveSession(null);
      }
    };
    checkActiveSession();
    const liveIv = setInterval(checkActiveSession, 3000);
    return () => {
      mounted = false;
      clearInterval(liveIv);
    };
  }, []);

  const handleSelect = (mode: 'entrepreneur' | 'individual') => {
    if (mode === 'entrepreneur') {
      if (!isLeadership) {
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        setMotivationalNotice("Work harder in deep work so one day you will be an entrepreneur! 💼🚀");
        noticeTimerRef.current = setTimeout(() => {
          setMotivationalNotice(null);
        }, 5000);
        return;
      }
      soundFX.playEntrepreneurClick();
    } else {
      soundFX.playIndividualClick();
    }

    localStorage.setItem('workspaceMode', mode);
    setTimeout(() => {
      navigate('/dashboard');
    }, 180);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspaceMode');
    navigate('/login');
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col relative select-none"
      style={{ background: 'var(--canvas)' }}
    >
      {/* ── Top Bar: Logo, User details & Sign out ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/select-mode" className="flex items-center cursor-pointer" title="smmart deep work">
            <img
              src="/smmart-logo.png"
              alt="smmart deep work"
              loading="lazy"
              decoding="async"
              className="h-8 md:h-10 w-auto object-contain transition-transform hover:scale-105"
            />
          </Link>
          <div className="hidden sm:block h-5 w-[1px]" style={{ background: 'var(--border)' }} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: 'rgba(11, 94, 215, 0.1)', color: 'var(--forest)', border: '1px solid rgba(11, 94, 215, 0.2)' }}>
              {user?.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'User'}
            </span>
          </div>
        </div>

        {/* On-going Deepwork Session (blinking & highlighted) */}
        {activeSession && (
          <div className="flex items-center">
            <button
              onClick={() => navigate('/deepwork')}
              className="animate-pulse px-4 py-1.5 rounded-full flex items-center gap-2 font-bold text-xs text-white shadow-md cursor-pointer transition-transform hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #1e3a24 0%, #15803d 100%)',
                border: '1.5px solid rgba(52, 211, 153, 0.8)',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.45)',
              }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <Timer size={14} className="animate-spin-slow text-emerald-300 shrink-0" />
              <span className="uppercase tracking-wider">On-going Deepwork Session</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                {activeSession.status === 'BREAK' ? 'Break' : 'Active'}
              </span>
              <ArrowRight size={13} className="text-emerald-300 ml-0.5 shrink-0" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--ink-4)', border: '1px solid var(--border)', background: 'var(--surface)' }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--error)';
              e.currentTarget.style.borderColor = 'var(--error)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--ink-4)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <LogOut size={12} />
            <span>Sign out</span>
          </button>
        </div>
      </div>



      {/* ── Split Screen Sections ── */}
      <div className="flex-1 w-full flex flex-col md:flex-row pt-14 md:pt-0">
        {/* ── Section 1: Entrepreneur (RBAC: Admin & Manager Only) ── */}
        <div
          onMouseEnter={() => setHovered('entrepreneur')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => handleSelect('entrepreneur')}
          className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 transition-colors duration-300 relative cursor-pointer"
          style={{
            background: hovered === 'entrepreneur'
              ? 'rgba(11, 94, 215, 0.04)'
              : 'transparent',
            borderRight: '1px solid var(--border)',
          }}
        >
          <div className="flex flex-col items-center text-center">
            <h1
              className="text-4xl md:text-6xl font-bold tracking-tight transition-all duration-300"
              style={{
                fontFamily: 'DM Sans, sans-serif',
                color: hovered === 'entrepreneur'
                  ? 'var(--forest)'
                  : 'var(--ink)',
                transform: hovered === 'entrepreneur' ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              Entrepreneur
            </h1>

            {/* Motivational message badge ONLY displayed after an individual clicks */}
            {motivationalNotice && !isLeadership && (
              <div
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold mt-3 transition-all animate-fade-in"
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                <Sparkles size={12} className="text-amber-600" />
                <span>Work harder so one day you will be an entrepreneur 💼</span>
              </div>
            )}

            {/* Normal Button by default */}
            <div className="mt-8">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('entrepreneur');
                }}
                className="px-8 py-3.5 rounded-full font-semibold text-sm transition-all duration-200 shadow-sm cursor-pointer hover:scale-105"
                style={{
                  background: 'var(--forest)',
                  color: '#ffffff',
                  border: 'none',
                }}
              >
                Enter Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* ── Section 2: Individual (Open to All Roles) ── */}
        <div
          onMouseEnter={() => setHovered('individual')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => handleSelect('individual')}
          className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 transition-colors duration-300 relative cursor-pointer"
          style={{
            background: hovered === 'individual' ? 'rgba(196, 127, 97, 0.04)' : 'transparent',
          }}
        >
          <div className="flex flex-col items-center text-center">
            <h1
              className="text-4xl md:text-6xl font-bold tracking-tight transition-all duration-300"
              style={{
                fontFamily: 'DM Sans, sans-serif',
                color: hovered === 'individual' ? 'var(--terra)' : 'var(--ink)',
                transform: hovered === 'individual' ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              Individual
            </h1>

            {/* Button always visible */}
            <div className="mt-8">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('individual');
                }}
                className="px-8 py-3.5 rounded-full font-semibold text-sm transition-all duration-200 hover:scale-105 cursor-pointer shadow-sm"
                style={{
                  background: 'var(--terra)',
                  color: '#ffffff',
                  border: 'none',
                }}
              >
                Enter Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
