import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SelectMode() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<'entrepreneur' | 'individual' | null>(null);

  const handleSelect = (mode: 'entrepreneur' | 'individual') => {
    localStorage.setItem('workspaceMode', mode);
    navigate('/dashboard');
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col md:flex-row select-none"
      style={{ background: 'var(--canvas)' }}
    >
      {/* ── Section 1: Entrepreneur ───────────────────────── */}
      <div
        onMouseEnter={() => setHovered('entrepreneur')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => handleSelect('entrepreneur')}
        className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 transition-colors duration-300 relative cursor-pointer"
        style={{
          background: hovered === 'entrepreneur' ? 'rgba(66, 84, 67, 0.04)' : 'transparent',
          borderRight: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col items-center text-center">
          <h1
            className="text-4xl md:text-6xl font-bold tracking-tight transition-all duration-300"
            style={{
              fontFamily: 'DM Sans, sans-serif',
              color: hovered === 'entrepreneur' ? 'var(--forest)' : 'var(--ink)',
              transform: hovered === 'entrepreneur' ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            Entrepreneur
          </h1>

          {/* Button only visible when hovered */}
          <div
            className="mt-8 transition-all duration-300"
            style={{
              opacity: hovered === 'entrepreneur' ? 1 : 0,
              visibility: hovered === 'entrepreneur' ? 'visible' : 'hidden',
              transform: hovered === 'entrepreneur' ? 'translateY(0)' : 'translateY(8px)',
              pointerEvents: hovered === 'entrepreneur' ? 'auto' : 'none',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelect('entrepreneur');
              }}
              className="px-8 py-3.5 rounded-full font-semibold text-sm transition-transform duration-200 hover:scale-105 cursor-pointer shadow-sm"
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

      {/* ── Section 2: Individual ─────────────────────────── */}
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

          {/* Button only visible when hovered */}
          <div
            className="mt-8 transition-all duration-300"
            style={{
              opacity: hovered === 'individual' ? 1 : 0,
              visibility: hovered === 'individual' ? 'visible' : 'hidden',
              transform: hovered === 'individual' ? 'translateY(0)' : 'translateY(8px)',
              pointerEvents: hovered === 'individual' ? 'auto' : 'none',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelect('individual');
              }}
              className="px-8 py-3.5 rounded-full font-semibold text-sm transition-transform duration-200 hover:scale-105 cursor-pointer shadow-sm"
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
  );
}
