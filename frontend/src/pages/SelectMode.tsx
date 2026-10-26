import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { soundFX } from '../utils/sound';

export default function SelectMode() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<'entrepreneur' | 'individual' | null>(null);

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

  const handleSelect = (mode: 'entrepreneur' | 'individual') => {
    if (mode === 'entrepreneur') {
      if (!isLeadership) {
        return; // Restricted by RBAC
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
            <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)', border: '1px solid rgba(66, 84, 67, 0.2)' }}>
              {user?.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'User'}
            </span>
          </div>
        </div>

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
          className={`flex-1 flex flex-col items-center justify-center p-8 md:p-16 transition-colors duration-300 relative ${isLeadership ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          style={{
            background: hovered === 'entrepreneur'
              ? (isLeadership ? 'rgba(66, 84, 67, 0.04)' : 'rgba(182, 83, 75, 0.02)')
              : 'transparent',
            borderRight: '1px solid var(--border)',
            opacity: !isLeadership ? 0.65 : 1,
          }}
        >
          <div className="flex flex-col items-center text-center">
            <h1
              className="text-4xl md:text-6xl font-bold tracking-tight transition-all duration-300"
              style={{
                fontFamily: 'DM Sans, sans-serif',
                color: hovered === 'entrepreneur'
                  ? (isLeadership ? 'var(--forest)' : 'var(--ink-3)')
                  : 'var(--ink)',
                transform: hovered === 'entrepreneur' && isLeadership ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              Entrepreneur
            </h1>

            {!isLeadership && (
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mt-3"
                style={{ background: 'rgba(182, 83, 75, 0.08)', color: 'var(--error)', border: '1px solid rgba(182, 83, 75, 0.2)' }}
              >
                <Lock size={12} />
                <span>Requires Admin / Manager Access</span>
              </div>
            )}

            {/* Button always visible */}
            <div className="mt-8">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('entrepreneur');
                }}
                disabled={!isLeadership}
                className={`px-8 py-3.5 rounded-full font-semibold text-sm transition-all duration-200 shadow-sm ${
                  isLeadership ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed'
                }`}
                style={{
                  background: isLeadership ? 'var(--forest)' : 'var(--surface-3)',
                  color: isLeadership ? '#ffffff' : 'var(--ink-4)',
                  border: isLeadership ? 'none' : '1px solid var(--border)',
                }}
              >
                {isLeadership ? 'Enter Dashboard' : 'Restricted (Admin Only)'}
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
