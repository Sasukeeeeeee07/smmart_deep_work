import React, { useState, useEffect } from 'react';
import { Lock, Unlock, AlertTriangle, CheckCircle2, Cpu, Globe, Loader2 } from 'lucide-react';
import { sessionService } from '../services/api';

interface LockoutScreenProps {
  deviceUid: string;
  deviceName?: string;
  lockoutUntil?: string | Date | null;
  initialRemainingSeconds?: number;
  reason?: string;
  invalidCount?: number;
  onUnlocked: () => void;
}

export const LockoutScreen: React.FC<LockoutScreenProps> = ({
  deviceUid,
  deviceName,
  lockoutUntil,
  initialRemainingSeconds = 172800,
  reason = 'Exceeded 10 invalid sessions (> 3 breaks per session)',
  invalidCount = 10,
  onUnlocked,
}) => {
  const calculateRemaining = () => {
    if (lockoutUntil) {
      return Math.max(0, Math.floor((new Date(lockoutUntil).getTime() - Date.now()) / 1000));
    }
    return initialRemainingSeconds;
  };

  const [secondsLeft, setSecondsLeft]   = useState<number>(calculateRemaining);
  const [isUnlocking, setIsUnlocking]   = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [actionError, setActionError]   = useState('');

  // 1-second countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(timer); onUnlocked(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onUnlocked]);

  // Poll backend every 4s for early unlock
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const status = await sessionService.getLockoutStatus(deviceUid);
        if (!status.isLockedOut) { clearInterval(poll); onUnlocked(); }
        else if (status.remainingSeconds > 0) {
          setSecondsLeft(curr => Math.abs(curr - status.remainingSeconds) > 3 ? status.remainingSeconds : curr);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(poll);
  }, [deviceUid, onUnlocked]);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;

  const unlockTime = lockoutUntil
    ? new Date(lockoutUntil).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date(Date.now() + secondsLeft * 1000).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Unlock / test endpoints need an ADMIN or MANAGER login; hide the buttons for everyone else
  const canOverride = (() => {
    try { return ['ADMIN', 'MANAGER'].includes(JSON.parse(localStorage.getItem('user') || '{}').role); } catch { return false; }
  })();
  const apiError = (err: any, fallback: string) => {
    const e = err?.response?.data?.error;
    return (typeof e === 'string' ? e : e?.message) || fallback;
  };

  const handleAdminUnlock = async () => {
    if (!confirm(`Admin override: unlock ${deviceUid}?`)) return;
    setIsUnlocking(true);
    setActionError('');
    try {
      await sessionService.unlockDevice(deviceUid);
      setUnlockSuccess(true);
      setTimeout(() => onUnlocked(), 1200);
    } catch (err: any) {
      setActionError(apiError(err, 'Failed to unlock. Please try again.'));
      setIsUnlocking(false);
    }
  };

  const handleTestLockout = async () => {
    setIsUnlocking(true);
    setActionError('');
    try {
      await sessionService.testLockout(deviceUid, 120);
      setSecondsLeft(120);
    } catch (err: any) {
      setActionError(apiError(err, 'Failed to trigger test lockout'));
    } finally { setIsUnlocking(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto select-none"
      style={{ background: '#1A1812' }}
    >
      {/* Subtle red ambient glow */}
      <div
        style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 500, height: 300,
          background: 'rgba(182, 83, 75, 0.12)',
          filter: 'blur(100px)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 660,
          background: 'rgba(26, 24, 18, 0.95)',
          border: '1px solid rgba(182, 83, 75, 0.35)',
          borderRadius: 24,
          boxShadow: '0 24px 80px rgba(182, 83, 75, 0.2), 0 8px 24px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)',
          padding: '40px 40px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          textAlign: 'center',
        }}
      >
        {/* Lock icon */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              width: 80, height: 80,
              borderRadius: '50%',
              background: 'rgba(182, 83, 75, 0.15)',
              animation: 'pulse-gentle 3s ease infinite',
            }}
          />
          <div
            style={{
              width: 64, height: 64,
              borderRadius: 16,
              background: 'rgba(182, 83, 75, 0.2)',
              border: '1px solid rgba(182, 83, 75, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={28} style={{ color: '#E57B73' }} />
          </div>
        </div>

        {/* Status badge */}
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px',
            borderRadius: 99,
            background: 'rgba(182, 83, 75, 0.12)',
            border: '1px solid rgba(182, 83, 75, 0.3)',
            color: '#E57B73',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E57B73', display: 'block', animation: 'pulse-gentle 2s ease infinite' }} />
          System locked
        </div>

        {/* Heading */}
        <div>
          <h1
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 32,
              fontWeight: 700,
              color: '#F5F3ED',
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
            }}
          >
            Access Restricted
          </h1>
          <p style={{ color: 'rgba(245, 243, 237, 0.5)', fontSize: 14, maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            {reason}
          </p>
        </div>

        {/* Countdown */}
        <div
          style={{
            width: '100%',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(182, 83, 75, 0.25)',
            borderRadius: 16,
            padding: '24px 20px',
          }}
        >
          <p style={{ color: 'rgba(245, 243, 237, 0.4)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Time remaining until unlock
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, maxWidth: 340, margin: '0 auto' }}>
            {[
              { val: pad(h), label: 'Hours' },
              { val: pad(m), label: 'Minutes' },
              { val: pad(s), label: 'Seconds' },
            ].map(({ val, label }) => (
              <div
                key={label}
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(182, 83, 75, 0.2)',
                  borderRadius: 12,
                  padding: '14px 10px',
                  textAlign: 'center',
                }}
              >
                <span
                  className="tabular-nums"
                  style={{ display: 'block', fontSize: 40, fontWeight: 800, color: '#E57B73', fontFamily: 'DM Sans, monospace', letterSpacing: '-0.02em', lineHeight: 1 }}
                >
                  {val}
                </span>
                <span style={{ display: 'block', fontSize: 10, color: 'rgba(245,243,237,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 6 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p style={{ color: 'rgba(245,243,237,0.3)', fontSize: 11, marginTop: 14 }}>
            Automatic unlock: <span style={{ color: 'rgba(245,243,237,0.6)', fontWeight: 600 }}>{unlockTime}</span>
          </p>
        </div>

        {/* Info rows */}
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: Cpu, title: `Device: ${deviceName || deviceUid}`, sub: 'LCD locked — sessions disabled' },
            { icon: Globe, title: 'Web access', sub: 'Dashboard restricted until unlock' },
          ].map(({ icon: Icon, title, sub }) => (
            <div
              key={title}
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(245,243,237,0.06)',
                borderRadius: 12,
                padding: '12px 14px',
                textAlign: 'left',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}
            >
              <div style={{ padding: 7, borderRadius: 8, background: 'rgba(182,83,75,0.12)', border: '1px solid rgba(182,83,75,0.2)', flexShrink: 0 }}>
                <Icon size={14} style={{ color: '#E57B73' }} />
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(245,243,237,0.75)', marginBottom: 2 }}>{title}</p>
                <p style={{ fontSize: 11, color: 'rgba(245,243,237,0.35)', lineHeight: 1.4 }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Anti-bypass notice */}
        <div
          style={{
            width: '100%',
            background: 'rgba(182,83,75,0.07)',
            border: '1px solid rgba(182,83,75,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
          }}
        >
          <AlertTriangle size={15} style={{ color: '#E57B73', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'rgba(245,243,237,0.5)', lineHeight: 1.6 }}>
            <strong style={{ color: 'rgba(245,243,237,0.7)' }}>Anti-bypass enforced.</strong>
            {' '}Power-cycling the hardware, refreshing this page, or clearing cache will{' '}
            <span style={{ textDecoration: 'underline', color: '#E57B73' }}>not</span>{' '}
            bypass this restriction. Lockout persists in NVS and cloud database.
          </p>
        </div>

        {/* Feedback */}
        {actionError && (
          <div style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(182,83,75,0.15)', border: '1px solid rgba(182,83,75,0.4)', color: '#E57B73', fontSize: 13 }}>
            {actionError}
          </div>
        )}
        {unlockSuccess && (
          <div
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              background: 'rgba(74,124,89,0.15)', border: '1px solid rgba(74,124,89,0.4)',
              color: '#6A9E78', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <CheckCircle2 size={14} />
            Unlocked successfully — restoring access…
          </div>
        )}

        {/* Admin actions */}
        <div
          style={{
            width: '100%',
            paddingTop: 20,
            borderTop: '1px solid rgba(245,243,237,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: 'rgba(245,243,237,0.35)' }}>
            Invalid sessions:{' '}
            <span style={{ color: '#E57B73', fontWeight: 700 }}>{invalidCount}/10</span>
          </span>
          {canOverride ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleTestLockout}
              disabled={isUnlocking}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(184,121,57,0.15)', border: '1px solid rgba(184,121,57,0.3)', color: '#D4A04A',
                transition: 'all 150ms ease', display: 'flex', alignItems: 'center', gap: 6,
                opacity: isUnlocking ? 0.5 : 1,
              }}
            >
              🧪 Test 2-min lockout
            </button>
            <button
              onClick={handleAdminUnlock}
              disabled={isUnlocking}
              style={{
                padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(74,124,89,0.2)', border: '1px solid rgba(74,124,89,0.4)', color: '#6A9E78',
                transition: 'all 150ms ease', display: 'flex', alignItems: 'center', gap: 6,
                opacity: isUnlocking ? 0.5 : 1,
              }}
            >
              {isUnlocking ? (
                <><Loader2 size={13} className="animate-spin" /> Unlocking…</>
              ) : (
                <><Unlock size={13} /> 🔓 Admin unlock</>
              )}
            </button>
          </div>
          ) : (
            <span style={{ fontSize: 12, color: 'rgba(245,243,237,0.35)' }}>Ask an admin or manager to unlock this desk early.</span>
          )}
        </div>
      </div>
    </div>
  );
};
