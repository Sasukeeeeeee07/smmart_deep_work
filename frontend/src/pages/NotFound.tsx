import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass, ArrowRight, LayoutDashboard, Sliders } from 'lucide-react';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page Not Found — smmart Desk';
  }, []);

  return (
    <div 
      className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center select-none"
      style={{ background: 'var(--canvas)' }}
    >
      <div className="max-w-md w-full p-8 rounded-2xl border shadow-xs space-y-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        
        <div 
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-xs"
          style={{ background: 'rgba(11, 94, 215, 0.1)', color: 'var(--forest)' }}
        >
          <Compass size={32} className="stroke-[2.2]" />
        </div>

        <div>
          <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            Error 404
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ink)] mt-3">
            Page Not Found
          </h1>
          <p className="text-sm font-medium text-[var(--ink-2)] mt-2 leading-relaxed">
            The workspace view or route you requested could not be located. It may have been moved or reorganized.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-center">
          <Link
            to="/dashboard"
            className="btn btn-primary px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <LayoutDashboard size={16} />
            <span>Go to Dashboard</span>
          </Link>

          <Link
            to="/settings"
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-colors flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-100"
            style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <Sliders size={16} className="text-[var(--forest)]" />
            <span>Workspace Settings</span>
          </Link>
        </div>

        <div className="pt-4 border-t border-[var(--border)]">
          <Link
            to="/deepwork"
            className="text-xs font-bold text-[var(--forest)] hover:underline inline-flex items-center gap-1.5"
          >
            <span>Jump to Deep Work Session</span>
            <ArrowRight size={13} />
          </Link>
        </div>

      </div>

      <p className="text-xs text-[var(--ink-4)] mt-6">
        smmart deep work &bull; focused productivity
      </p>
    </div>
  );
}
