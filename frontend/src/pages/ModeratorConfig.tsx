import { useState, useEffect } from 'react';
import { 
  Bot, Sparkles, Volume2, Shield, Play, Check, RefreshCw, 
  Radio, Save, Copy, CheckCircle2, ShieldCheck, HeartHandshake, Flame, Compass, Cpu
} from 'lucide-react';
import { sessionService, deviceService } from '../services/api';

interface Persona {
  id: string;
  name: string;
  title: string;
  tagline: string;
  tone: string;
  icon: any;
  defaultSpeed: number;
  samplePhrase: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'athena',
    name: 'Athena',
    title: 'The Executive Strategist',
    tagline: 'Sharp, objective, and milestone-driven.',
    tone: 'Crisp & Professional',
    icon: Compass,
    defaultSpeed: 1.05,
    samplePhrase: 'Target session initiated. We are aiming for 120 minutes of uninterrupted execution.',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    title: 'The Stoic Mentor',
    tagline: 'Calm, measured, and resilient focus.',
    tone: 'Steady & Grounded',
    icon: ShieldCheck,
    defaultSpeed: 0.95,
    samplePhrase: 'Do not let fleeting impulses disrupt your deep work. Return to your primary duty.',
  },
  {
    id: 'rex',
    name: 'Coach Rex',
    title: 'High-Performance Trainer',
    tagline: 'High-intensity accountability with zero excuses.',
    tone: 'Assertive & Driven',
    icon: Flame,
    defaultSpeed: 1.15,
    samplePhrase: 'Time is ticking. Get back to your desk right now and earn those five points!',
  },
  {
    id: 'aria',
    name: 'Aria',
    title: 'Mindfulness & Flow Guide',
    tagline: 'Gentle, breath-centered, sustaining flow state.',
    tone: 'Warm & Soothing',
    icon: HeartHandshake,
    defaultSpeed: 0.9,
    samplePhrase: 'Breathe in deeply, relax your shoulders, and gently immerse yourself back into focus.',
  },
];

interface TriggerRule {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  delaySec: number;
  script: string;
  escalationScript?: string;
  soundAlarm: boolean;
  category: 'presence' | 'pacing' | 'break' | 'posture';
}

const DEFAULT_RULES: TriggerRule[] = [
  {
    id: 'absence_warn',
    title: 'Radar Absence Detection (First Strike)',
    description: 'Triggered when radar detects you stepped away from your desk without starting an approved break.',
    enabled: true,
    delaySec: 30,
    script: 'You have stepped away from your desk. Please return to maintain your active deep work session.',
    escalationScript: 'Warning: Continued absence will invalidate your session and forfeit your productivity points.',
    soundAlarm: false,
    category: 'presence',
  },
  {
    id: 'break_limit',
    title: 'Break Overstay Intervention (5 Min Warning)',
    description: 'Autonomous voice reminder when an approved break hits the 5-minute threshold.',
    enabled: true,
    delaySec: 300,
    script: 'Your 5-minute break allowance has elapsed. Please return to your desk to avoid penalty.',
    soundAlarm: false,
    category: 'break',
  },
  {
    id: 'break_emergency',
    title: 'Break Hard Cutoff & Dying Alarm (8 Min Warning)',
    description: 'Final voice ultimatum before the desk sounds the emergency alarm and invalidates session.',
    enabled: true,
    delaySec: 480,
    script: 'Final notice: Session entering dying state in two minutes. Return to desk immediately.',
    soundAlarm: true,
    category: 'break',
  },
  {
    id: 'milestone_25',
    title: '25-Min Flow State Anchor (Pomodoro Checkpoint)',
    description: 'Encouraging checkpoint when the user successfully crosses 25 minutes of continuous focus.',
    enabled: true,
    delaySec: 1500,
    script: 'Twenty-five minutes logged. Flow state established. Keep this momentum.',
    soundAlarm: false,
    category: 'pacing',
  },
  {
    id: 'milestone_60',
    title: '60-Min Halfway Milestone',
    description: 'Congratulatory voice checkpoint marking the halfway mark of a 2-hour session.',
    enabled: true,
    delaySec: 3600,
    script: 'One hour of deep work completed. You are halfway to your full milestone. Excellent focus.',
    soundAlarm: false,
    category: 'pacing',
  },
  {
    id: 'milestone_90',
    title: '90-Min Productivity Spike Announcement',
    description: 'Informs user that the 5-point spike bonus threshold is unlocked.',
    enabled: true,
    delaySec: 5400,
    script: 'Ninety minutes reached! Productivity spike bonus unlocked. Finish strong for maximum score.',
    soundAlarm: false,
    category: 'pacing',
  },
  {
    id: 'desk_welcome',
    title: 'Welcome Back Greeting on Desk Arrival',
    description: 'Welcomes user back and automatically announces session resumption when seated.',
    enabled: true,
    delaySec: 3,
    script: 'Welcome back. Radar presence verified. Resuming your focus timer.',
    soundAlarm: false,
    category: 'presence',
  },
  {
    id: 'posture_check',
    title: 'Inactivity & Posture Slump Check (45 Mins)',
    description: 'Gentle ergonomics prompt if continuous still presence without micro-movement is recorded.',
    enabled: true,
    delaySec: 2700,
    script: 'Quick posture check: align your spine, roll your shoulders back, and take a deep breath.',
    soundAlarm: false,
    category: 'posture',
  },
];

export default function ModeratorConfig() {
  const [autonomousEnabled, setAutonomousEnabled] = useState(true);
  const [selectedPersona, setSelectedPersona]     = useState('athena');
  const [strictness, setStrictness]               = useState<'gentle' | 'balanced' | 'hardcore'>('balanced');
  const [volume, setVolume]                       = useState(85);
  const [speechSpeed, setSpeechSpeed]             = useState(1.0);
  const [accent, setAccent]                       = useState('en-US');
  const [rules, setRules]                         = useState<TriggerRule[]>(DEFAULT_RULES);
  const [devices, setDevices]                     = useState<any[]>([]);
  const [selectedUid, setSelectedUid]             = useState('ESP32-S3-01');
  const [savedSuccess, setSavedSuccess]           = useState(false);
  const [copiedUrl, setCopiedUrl]                 = useState(false);
  const [testingVoice, setTestingVoice]           = useState<string | null>(null);

  // Load persisted config from localStorage
  useEffect(() => {
    document.title = 'AI Moderator Engine — smmart Desk';
    const saved = localStorage.getItem('smmart_ai_moderator_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.autonomousEnabled !== undefined) setAutonomousEnabled(parsed.autonomousEnabled);
        if (parsed.selectedPersona) setSelectedPersona(parsed.selectedPersona);
        if (parsed.strictness) setStrictness(parsed.strictness);
        if (parsed.volume) setVolume(parsed.volume);
        if (parsed.speechSpeed) setSpeechSpeed(parsed.speechSpeed);
        if (parsed.accent) setAccent(parsed.accent);
        if (parsed.rules && Array.isArray(parsed.rules)) setRules(parsed.rules);
      } catch (e) {
        console.error('Failed to parse saved moderator config', e);
      }
    }

    // Fetch available devices
    deviceService.getAllDevices().then(devs => {
      if (devs && devs.length > 0) {
        setDevices(devs);
        setSelectedUid(devs[0].uid);
      }
    }).catch(() => {});
  }, []);

  const handleSave = () => {
    const config = {
      autonomousEnabled,
      selectedPersona,
      strictness,
      volume,
      speechSpeed,
      accent,
      rules,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('smmart_ai_moderator_config', JSON.stringify(config));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleReset = () => {
    if (window.confirm('Reset all AI Moderator settings to system defaults?')) {
      setAutonomousEnabled(true);
      setSelectedPersona('athena');
      setStrictness('balanced');
      setVolume(85);
      setSpeechSpeed(1.0);
      setAccent('en-US');
      setRules(DEFAULT_RULES);
      localStorage.removeItem('smmart_ai_moderator_config');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  // Preview voice locally in browser or send to live desk speaker
  const playSample = async (text: string, sendToDesk = false) => {
    setTestingVoice(text);
    if (sendToDesk && selectedUid) {
      try {
        await sessionService.sendModeratorCommand(selectedUid, text);
      } catch (err) {
        console.error('Failed to dispatch voice to desk', err);
      }
    }

    // Also audibly play in browser via Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechSpeed;
      utterance.volume = volume / 100;
      utterance.lang = accent;
      
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Find matching voice or fallback
        const matching = voices.find(v => v.lang.includes(accent.split('-')[0])) || voices[0];
        if (matching) utterance.voice = matching;
      }

      utterance.onend = () => setTestingVoice(null);
      utterance.onerror = () => setTestingVoice(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setTestingVoice(null), 2500);
    }
  };

  const updateRule = (id: string, updates: Partial<TriggerRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const currentPersonaObj = PERSONAS.find(p => p.id === selectedPersona) || PERSONAS[0];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* ── TOP HEADER: PRIVACY & AUTONOMY BADGE ── */}
      <div 
        className="p-6 sm:p-8 rounded-3xl border transition-all relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(66, 84, 67, 0.08) 0%, rgba(255, 254, 250, 0.95) 100%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
              <span 
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border"
                style={{
                  background: 'rgba(66, 84, 67, 0.12)',
                  borderColor: 'rgba(66, 84, 67, 0.25)',
                  color: 'var(--forest)',
                }}
              >
                <Bot size={13} />
                Autonomous Engine
              </span>
              <span 
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                style={{
                  background: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--ink-3)',
                }}
              >
                <Radio size={12} className="text-amber-600 animate-pulse" />
                URL Exclusive Configuration
              </span>
            </div>

            <h1 
              className="text-2xl sm:text-3xl font-extrabold tracking-tight"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
            >
              AI Moderator Studio & Automation Engine
            </h1>
            <p className="text-sm mt-1.5 max-w-2xl leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Configure intelligent real-time presence enforcement, milestone cadence, and synthetic voice cues 
              so your SmartDesk acts as an autonomous focus coach without human supervision.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleCopyUrl}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer hover:shadow-xs"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--ink)',
              }}
              title="Copy secret configuration link"
            >
              {copiedUrl ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
              <span>{copiedUrl ? 'Link Copied!' : 'Copy Direct URL'}</span>
            </button>

            <button
              onClick={handleReset}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer hover:shadow-xs"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--ink-3)',
              }}
            >
              <RefreshCw size={14} />
              <span>Defaults</span>
            </button>

            <button
              onClick={handleSave}
              className="btn btn-primary px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {savedSuccess ? <Check size={16} /> : <Save size={16} />}
              <span>{savedSuccess ? 'Changes Saved!' : 'Save Engine Settings'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: MASTER AUTONOMOUS CONTROL & STRICTNESS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Master autonomous switch */}
        <div 
          className="p-6 rounded-2xl border flex flex-col justify-between"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-4)]">
                Master Protocol
              </span>
              <span 
                className={`w-2.5 h-2.5 rounded-full ${autonomousEnabled ? 'bg-emerald-500 animate-ping' : 'bg-gray-300'}`} 
              />
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              Autonomous Intervention
            </h3>
            <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--ink-3)' }}>
              When enabled, the radar sensor directly commands the speaker without requiring any human moderator click.
            </p>
          </div>

          <div className="pt-4 mt-6 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {autonomousEnabled ? 'AI Coach is Active' : 'AI Coach is Paused'}
            </span>
            <button
              type="button"
              onClick={() => setAutonomousEnabled(!autonomousEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autonomousEnabled ? 'bg-[var(--forest)]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  autonomousEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Strictness Level */}
        <div 
          className="p-6 rounded-2xl border flex flex-col justify-between lg:col-span-2"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-4)]">
              Discipline Profile
            </span>
            <h3 className="text-lg font-bold mt-1" style={{ color: 'var(--ink)' }}>
              Intervention Strictness & Leeway
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
              Adjusts how aggressively the AI intervenes on radar breaks and time drift.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 mt-4 border-t border-[var(--border)]">
            {[
              {
                id: 'gentle',
                name: 'Gentle Flow',
                desc: '60s leeway. Friendly prompts, no sirens. Best for creative tasks.',
                badge: 'Relaxed',
              },
              {
                id: 'balanced',
                name: 'Balanced Executive',
                desc: '30s leeway. Standard checkpoints and pacing cues. (Recommended)',
                badge: 'Optimal',
              },
              {
                id: 'hardcore',
                name: 'Hardcore Drill',
                desc: '15s leeway. Instant away alerts, loud alarm countdowns, zero excuses.',
                badge: 'Strict',
              },
            ].map(m => {
              const active = strictness === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setStrictness(m.id as any)}
                  className="p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between"
                  style={{
                    background: active ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface-2)',
                    borderColor: active ? 'var(--forest)' : 'var(--border)',
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs" style={{ color: 'var(--ink)' }}>{m.name}</span>
                      <span 
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: active ? 'var(--forest)' : 'rgba(0,0,0,0.05)',
                          color: active ? '#ffffff' : 'var(--ink-3)',
                        }}
                      >
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>{m.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: AI PERSONA & VOICE STUDIO ── */}
      <div 
        className="p-6 sm:p-8 rounded-3xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                AI Voice Persona Studio
              </h2>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
              Choose the vocal personality that best reinforces your psychological flow state.
            </p>
          </div>

          {/* Quick Audition Player & Target Device */}
          <div className="flex items-center gap-2 flex-wrap">
            {devices.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-2)] border-[var(--border)] text-xs">
                <Cpu size={14} className="text-[var(--forest)]" />
                <select
                  value={selectedUid}
                  onChange={e => setSelectedUid(e.target.value)}
                  className="bg-transparent text-xs font-bold outline-none cursor-pointer text-[var(--ink)]"
                >
                  {devices.map(d => (
                    <option key={d.uid} value={d.uid}>
                      {d.name || d.uid} ({d.uid})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => playSample(currentPersonaObj.samplePhrase, false)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer hover:border-[var(--forest)]"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Volume2 size={14} className={testingVoice ? 'animate-bounce text-emerald-600' : ''} />
              <span>{testingVoice ? 'Speaking…' : 'Audition in Browser'}</span>
            </button>

            <button
              onClick={() => playSample(currentPersonaObj.samplePhrase, true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer text-white shadow-xs"
              style={{ background: 'var(--forest)', borderColor: 'var(--forest)' }}
              title="Broadcasts TTS directly through ESP32 speaker hardware"
            >
              <Play size={14} />
              <span>Broadcast to Desk ({selectedUid})</span>
            </button>
          </div>
        </div>

        {/* Persona Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {PERSONAS.map(p => {
            const active = selectedPersona === p.id;
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedPersona(p.id);
                  setSpeechSpeed(p.defaultSpeed);
                }}
                className="p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between"
                style={{
                  background: active ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface-2)',
                  borderColor: active ? 'var(--forest)' : 'var(--border)',
                  transform: active ? 'translateY(-2px)' : 'none',
                  boxShadow: active ? '0 4px 12px rgba(66, 84, 67, 0.1)' : 'none',
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div 
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: active ? 'var(--forest)' : 'rgba(0,0,0,0.06)',
                        color: active ? '#ffffff' : 'var(--ink-2)',
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    {active && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--forest)]">
                        <Check size={12} /> Active
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{p.name}</p>
                  <p className="text-[11px] font-semibold text-[var(--forest)]">{p.title}</p>
                  <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--ink-3)' }}>{p.tagline}</p>
                </div>

                <div className="pt-3 mt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px]">
                  <span className="text-[var(--ink-4)]">Tone</span>
                  <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{p.tone}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Acoustic & Speech Modulators */}
        <div 
          className="p-5 rounded-2xl border grid grid-cols-1 sm:grid-cols-3 gap-6"
          style={{ background: 'var(--canvas)', borderColor: 'var(--border)' }}
        >
          {/* Accent Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>
              Language & Accent
            </label>
            <select
              value={accent}
              onChange={e => setAccent(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border outline-none cursor-pointer"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <option value="en-US">English (United States — Crisp)</option>
              <option value="en-GB">English (United Kingdom — Oxford)</option>
              <option value="en-AU">English (Australia — Clean)</option>
              <option value="en-IN">English (India — Neutral Professional)</option>
            </select>
          </div>

          {/* Speech Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                Speech Cadence ({speechSpeed.toFixed(2)}x)
              </label>
              <span className="text-xs text-[var(--ink-4)]">
                {speechSpeed < 1 ? 'Deliberate' : speechSpeed === 1 ? 'Natural' : 'Snappy'}
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              value={speechSpeed}
              onChange={e => setSpeechSpeed(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-[var(--forest)]"
            />
          </div>

          {/* Hardware Volume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                Speaker Gain ({volume}%)
              </label>
              <span className="text-xs text-[var(--ink-4)]">
                {volume > 80 ? 'Loud & Clear' : 'Discreet'}
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={volume}
              onChange={e => setVolume(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer accent-[var(--forest)]"
            />
          </div>
        </div>
      </div>

      {/* ── SECTION 3: AUTONOMOUS TRIGGER PROTOCOL MATRIX ── */}
      <div 
        className="p-6 sm:p-8 rounded-3xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-[var(--forest)]" />
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                Autonomous Trigger Protocols
              </h2>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
              Define exactly how your desk intervenes during radar absence, break overstays, and focus milestones.
            </p>
          </div>

          <span className="text-xs font-semibold px-3 py-1 rounded-lg border text-[var(--ink-3)]" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            {rules.filter(r => r.enabled).length} of {rules.length} Protocols Active
          </span>
        </div>

        {/* Rule cards */}
        <div className="space-y-4">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="p-5 rounded-2xl border transition-all"
              style={{
                background: rule.enabled ? 'var(--canvas)' : 'rgba(0,0,0,0.02)',
                borderColor: rule.enabled ? 'var(--border)' : 'rgba(0,0,0,0.06)',
                opacity: rule.enabled ? 1 : 0.65,
              }}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    className={`mt-1 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      rule.enabled ? 'bg-[var(--forest)]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                        rule.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
                        {rule.title}
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-white" style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}>
                        Trigger: {rule.delaySec < 60 ? `${rule.delaySec}s` : `${Math.round(rule.delaySec / 60)}m`}
                      </span>
                      {rule.soundAlarm && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          Siren Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                      {rule.description}
                    </p>

                    {/* Script Editor */}
                    <div className="mt-3">
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ink-4)' }}>
                        Synthesized Voice Script
                      </label>
                      <input
                        type="text"
                        value={rule.script}
                        onChange={e => updateRule(rule.id, { script: e.target.value })}
                        disabled={!rule.enabled}
                        className="w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none"
                        style={{
                          background: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--ink)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Test button */}
                <div className="flex md:flex-col items-center gap-2 shrink-0">
                  <button
                    onClick={() => playSample(rule.script, false)}
                    disabled={!rule.enabled}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer hover:border-[var(--forest)] disabled:opacity-40"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <Volume2 size={13} />
                    <span>Audition</span>
                  </button>
                  <button
                    onClick={() => playSample(rule.script, true)}
                    disabled={!rule.enabled}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer text-white shadow-xs disabled:opacity-40"
                    style={{ background: 'var(--forest)', borderColor: 'var(--forest)' }}
                    title="Send audio immediately to desk speaker"
                  >
                    <Play size={13} />
                    <span>Desk Test</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER HINT: SECURITY & DIRECT ACCESS ── */}
      <div 
        className="p-5 rounded-2xl border flex items-center justify-between flex-wrap gap-4"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            <strong>URL-Only Security:</strong> This configuration interface is excluded from the navigation bar. 
            Access is restricted to users who know the direct link (<code>/moderator-config</code> or <code>/ai-moderator</code>).
          </p>
        </div>

        <button
          onClick={handleSave}
          className="btn btn-primary px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm ml-auto"
        >
          <Save size={15} />
          <span>Save AI Preferences</span>
        </button>
      </div>
    </div>
  );
}
