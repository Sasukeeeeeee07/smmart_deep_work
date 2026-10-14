import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Clock, AlertTriangle, RefreshCw, Cpu, Globe, CheckCircle2 } from 'lucide-react';
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
  reason = 'Exceeded 10 invalid sessions (>3 breaks per session)',
  invalidCount = 10,
  onUnlocked,
}) => {
  // Compute initial remaining seconds from lockoutUntil or initialRemainingSeconds
  const calculateRemaining = () => {
    if (lockoutUntil) {
      const diff = Math.max(0, Math.floor((new Date(lockoutUntil).getTime() - Date.now()) / 1000));
      return diff;
    }
    return initialRemainingSeconds;
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(calculateRemaining);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [actionError, setActionError] = useState('');

  // 1-second countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onUnlocked();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onUnlocked]);

  // Periodic status poll (every 4s) to check if unlocked by hardware or another admin
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await sessionService.getLockoutStatus(deviceUid);
        if (!status.isLockedOut) {
          clearInterval(pollInterval);
          onUnlocked();
        } else if (status.remainingSeconds > 0) {
          // Sync drift if difference is more than 3 seconds
          setSecondsLeft((curr) => {
            if (Math.abs(curr - status.remainingSeconds) > 3) {
              return status.remainingSeconds;
            }
            return curr;
          });
        }
      } catch (err) {
        console.warn('[LOCKOUT SCREEN] Polling status failed', err);
      }
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [deviceUid, onUnlocked]);

  // Format digital countdown string matching the hardware LCD
  const formatCountdown = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      return {
        formatted: `${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`,
        hours: pad(hours),
        minutes: pad(minutes),
        seconds: pad(seconds),
      };
    }
    return {
      formatted: `${pad(minutes)}m : ${pad(seconds)}s`,
      hours: '00',
      minutes: pad(minutes),
      seconds: pad(seconds),
    };
  };

  const { hours, minutes, seconds } = formatCountdown(secondsLeft);

  // Target unlock date
  const targetUnlockDate = lockoutUntil
    ? new Date(lockoutUntil).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : new Date(Date.now() + secondsLeft * 1000).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

  const handleAdminUnlock = async () => {
    if (!confirm(`Are you sure you want to perform an ADMIN OVERRIDE and unlock ${deviceUid}?`)) {
      return;
    }
    setIsUnlocking(true);
    setActionError('');
    try {
      await sessionService.unlockDevice(deviceUid);
      setUnlockSuccess(true);
      setTimeout(() => {
        onUnlocked();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to unlock device', err);
      setActionError(err.response?.data?.error || 'Failed to unlock device. Please try again.');
      setIsUnlocking(false);
    }
  };

  const handleTestLockout = async (sec: number) => {
    setIsUnlocking(true);
    setActionError('');
    try {
      await sessionService.testLockout(deviceUid, sec);
      setSecondsLeft(sec);
      setIsUnlocking(false);
    } catch (err: any) {
      console.error('Test lockout failed', err);
      setActionError('Failed to trigger test lockout');
      setIsUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#020617] text-slate-100 flex flex-col justify-center items-center p-4 md:p-8 overflow-y-auto select-none">
      {/* Ambient glowing radial lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-red-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[250px] bg-orange-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Main Lockout Container */}
      <div className="relative w-full max-w-3xl bg-slate-900/90 border border-red-500/40 rounded-3xl p-6 md:p-10 shadow-2xl shadow-red-950/60 backdrop-blur-xl flex flex-col items-center text-center space-y-6">
        
        {/* Glowing Lockout Icon with Pulse Ring */}
        <div className="relative flex items-center justify-center">
          <div className="absolute w-28 h-28 bg-red-500/20 rounded-full animate-ping pointer-events-none" />
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 border-2 border-red-400/80 shadow-lg shadow-red-600/50 flex items-center justify-center">
            <Lock size={44} className="text-white drop-shadow-md animate-pulse" />
          </div>
        </div>

        {/* Header Badges & Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-black tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            CRITICAL SYSTEM LOCKOUT
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-sm">
            SYSTEM LOCKED OUT
          </h1>
          <p className="text-sm md:text-base text-red-300/90 font-medium max-w-xl mx-auto">
            {reason}
          </p>
        </div>

        {/* Digital Reverse Countdown Display */}
        <div className="w-full bg-black/60 border-2 border-red-500/50 rounded-2xl p-6 shadow-inner relative overflow-hidden">
          <div className="text-xs uppercase tracking-widest text-red-400 font-bold mb-3 flex items-center justify-center gap-2">
            <Clock size={14} className="animate-spin text-red-400" />
            REVERSE COUNTDOWN REMAINING
          </div>

          {/* Large Digital Clocks */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
            <div className="bg-slate-950/80 border border-red-500/30 rounded-xl p-3 md:p-4 text-center">
              <span className="block text-3xl md:text-5xl font-mono font-black text-red-500 tracking-tight">
                {hours}
              </span>
              <span className="text-[10px] md:text-xs text-slate-400 uppercase font-semibold mt-1">Hours</span>
            </div>
            <div className="bg-slate-950/80 border border-red-500/30 rounded-xl p-3 md:p-4 text-center">
              <span className="block text-3xl md:text-5xl font-mono font-black text-red-500 tracking-tight">
                {minutes}
              </span>
              <span className="text-[10px] md:text-xs text-slate-400 uppercase font-semibold mt-1">Minutes</span>
            </div>
            <div className="bg-slate-950/80 border border-red-500/30 rounded-xl p-3 md:p-4 text-center">
              <span className="block text-3xl md:text-5xl font-mono font-black text-red-500 tracking-tight">
                {seconds}
              </span>
              <span className="text-[10px] md:text-xs text-slate-400 uppercase font-semibold mt-1">Seconds</span>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400 flex items-center justify-center gap-2">
            <span>Scheduled Automatic Unlock:</span>
            <span className="text-slate-200 font-bold">{targetUnlockDate}</span>
          </div>
        </div>

        {/* Hardware & Web Synchronization Badges */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-xs">
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3 text-left">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
              <Cpu size={18} />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                Hardware Device: {deviceName ? `${deviceName} (${deviceUid})` : deviceUid}
                <span className="w-2 h-2 rounded-full bg-red-500" />
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                LCD locked on reverse timer. Touch and sessions disabled.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3 text-left">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
              <Globe size={18} />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                Web Workspace Access
                <span className="w-2 h-2 rounded-full bg-red-500" />
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Dashboard restricted. System remains locked across sessions.
              </p>
            </div>
          </div>
        </div>

        {/* Security / Anti-Bypass Notice */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-xs text-slate-300 flex items-start gap-3 text-left w-full">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-red-300">Strict Anti-Bypass Enforced:</strong> Power-cycling the desk hardware, refreshing this webpage, or clearing browser cache will <span className="underline decoration-red-400 underline-offset-2 font-semibold">NOT</span> bypass this restriction. The lockout is persisted in hardware non-volatile storage (NVS) and cloud database.
          </p>
        </div>

        {actionError && (
          <div className="w-full p-3 rounded-lg bg-red-600/20 border border-red-500 text-red-200 text-xs">
            {actionError}
          </div>
        )}

        {unlockSuccess && (
          <div className="w-full p-3 rounded-lg bg-green-600/20 border border-green-500 text-green-200 text-xs flex items-center justify-center gap-2">
            <CheckCircle2 size={16} />
            System unlocked successfully! Restoring dashboard...
          </div>
        )}

        {/* Administrative Actions */}
        <div className="w-full pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 text-left">
            <span>Invalid Sessions: </span>
            <span className="text-red-400 font-bold">{invalidCount}/10</span>
            <span className="text-slate-500 ml-2">(Policy threshold reached)</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Instant Testing Buttons */}
            <button
              onClick={() => handleTestLockout(120)}
              disabled={isUnlocking}
              className="px-3 py-2 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 text-xs font-semibold transition-all"
            >
              🧪 Test 2-Min Lockout
            </button>
            <button
              onClick={() => handleTestLockout(172800)}
              disabled={isUnlocking}
              className="px-3 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 text-xs font-semibold transition-all"
            >
              🔒 48-Hour Lockout
            </button>

            {/* Admin Override Unlock */}
            <button
              onClick={handleAdminUnlock}
              disabled={isUnlocking}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-bold shadow-lg shadow-green-900/40 border border-green-400/40 flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
            >
              {isUnlocking ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Unlocking System...
                </>
              ) : (
                <>
                  <Unlock size={14} />
                  Admin Instant Unlock
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
