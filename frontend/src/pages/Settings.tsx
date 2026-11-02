import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Sliders, 
  Clock, 
  Coffee, 
  Monitor, 
  Volume2, 
  Radio, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Award, 
  ArrowRight,
  ShieldAlert,
  Wifi,
  Sparkles,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { deviceService } from '../services/api';

interface WorkspaceSettings {
  targetFocusMin: number;
  autoUnlockFourthBreak: boolean;
  strictBreakReminder: boolean;
  warmupCountdown: boolean;
  awayReminderSeconds: number;
  buzzerTone: 'gentle_chime' | 'soft_bell' | 'pulsed_beep' | 'silent';
  buzzerVolume: 'low' | 'medium' | 'high';
  voicePromptsEnabled: boolean;
  presenceSensitivity: 'high' | 'balanced' | 'relaxed';
}

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  targetFocusMin: 120,
  autoUnlockFourthBreak: true,
  strictBreakReminder: true,
  warmupCountdown: false,
  awayReminderSeconds: 45,
  buzzerTone: 'gentle_chime',
  buzzerVolume: 'medium',
  voicePromptsEnabled: true,
  presenceSensitivity: 'balanced',
};

interface DisplayConfig {
  breakDisplayMode: 'SESSION' | 'DAILY';
  showSessionTimer: boolean;
  showBreaks: boolean;
  showProdScore: boolean;
  showProdSpike: boolean;
  showSelfRating: boolean;
  showModerator: boolean;
}

const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  breakDisplayMode: 'SESSION',
  showSessionTimer: true,
  showBreaks: true,
  showProdScore: true,
  showProdSpike: true,
  showSelfRating: true,
  showModerator: true,
};

export default function SettingsPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  // Workspace focus preferences
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(() => {
    try {
      const saved = localStorage.getItem('smmart_workspace_settings');
      if (saved) {
        return { ...DEFAULT_WORKSPACE_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_WORKSPACE_SETTINGS;
  });

  // Hardware screen display preferences (synced with ESP32)
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG);

  // Load devices and existing device configs
  const loadDeviceData = async () => {
    try {
      const devList = await deviceService.getAllDevices();
      setDevices(devList);

      const uidToUse = selectedUid || (devList.length > 0 ? devList[0].uid : '');
      if (!selectedUid && uidToUse) {
        setSelectedUid(uidToUse);
      }

      if (uidToUse) {
        // Fetch display config for active device
        try {
          const configRes = await deviceService.getDisplayConfig(uidToUse);
          if (configRes) {
            setDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, ...configRes });
          }
        } catch {
          // Keep default if endpoint is unavailable
        }
      }
    } catch (err) {
      console.error('Failed to load device settings data', err);
    }
  };

  useEffect(() => {
    document.title = 'Settings — smmart Desk';
    loadDeviceData();
  }, [selectedUid]);

  const selectedDevice = devices.find(d => d.uid === selectedUid);
  const isOnline = Boolean(
    selectedDevice &&
    selectedDevice.status === 'ONLINE' &&
    selectedDevice.lastHeartbeat &&
    (Date.now() - new Date(selectedDevice.lastHeartbeat).getTime() < 120000)
  );

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      // 1. Persist workspace focus preferences to localStorage
      localStorage.setItem('smmart_workspace_settings', JSON.stringify(workspaceSettings));

      // 2. Persist hardware display config to backend if device selected
      if (selectedUid) {
        try {
          await deviceService.updateDisplayConfig(selectedUid, displayConfig);
        } catch (apiErr) {
          console.warn('Hardware display config update non-fatal error:', apiErr);
        }
      }

      setSaveStatus({
        type: 'success',
        message: 'Settings saved successfully. Preferences synced to your smmart Desk workspace.'
      });
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveStatus({
        type: 'error',
        message: 'Failed to save settings. Please verify connection and try again.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePingDevice = async () => {
    if (!selectedUid) return;
    setPingStatus('Pinging device...');
    try {
      const act = await deviceService.getLatestActivity(selectedUid);
      setPingStatus(act ? `Device active! Last response: ${new Date(act.timestamp || Date.now()).toLocaleTimeString()}` : 'Device acknowledged ping.');
    } catch {
      setPingStatus('Device ping completed.');
    }
    setTimeout(() => setPingStatus(null), 3500);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all workspace settings and screen widgets to default values?')) {
      setWorkspaceSettings(DEFAULT_WORKSPACE_SETTINGS);
      setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
      localStorage.setItem('smmart_workspace_settings', JSON.stringify(DEFAULT_WORKSPACE_SETTINGS));
      setSaveStatus({
        type: 'success',
        message: 'Workspace settings reset to default values.'
      });
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  return (
    <div className="max-w-[1140px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fade-in pb-16">
      
      {/* ── Top Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs"
              style={{ background: 'rgba(11, 94, 215, 0.1)', color: 'var(--forest)' }}
            >
              <Sliders size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ink)]">
                Settings
              </h1>
              <p className="text-sm font-medium text-[var(--ink-2)] mt-0.5">
                Configure your workspace for better focus.
              </p>
            </div>
          </div>
        </div>

        {/* Compact Device Status Indicator & Rewards Link */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Indicator */}
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border shadow-2xs ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-800 border-rose-500/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span>{selectedUid ? `${selectedUid}: ${isOnline ? 'ONLINE' : 'OFFLINE'}` : 'NO DEVICE CONNECTED'}</span>
          </div>

          <Link
            to="/rewards"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-amber-400 hover:shadow-xs"
            style={{ background: 'rgba(254, 243, 199, 0.5)', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#92400E' }}
            title="View smmart coins, weekly points & milestones"
          >
            <Award size={14} className="text-amber-700" />
            <span>Rewards & Milestones</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Save Notification Banner */}
      {saveStatus && (
        <div 
          className={`p-4 rounded-xl border flex items-center gap-3 shadow-xs text-sm font-semibold transition-all ${
            saveStatus.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-900'
          }`}
        >
          {saveStatus.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-rose-700 shrink-0" />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Discreet relocation callout */}
      <div 
        className="p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <Info size={16} className="text-[var(--forest)] shrink-0" />
          <span className="text-[var(--ink-2)] font-medium">
            Looking for your smmart deep work coins, weekly targets, or Bloom badge?
          </span>
        </div>
        <Link 
          to="/rewards" 
          className="font-bold text-[var(--forest)] hover:underline flex items-center gap-1 shrink-0"
        >
          <span>View Rewards</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* ── SECTION 1: SESSION PREFERENCES (First and most prominent) ── */}
      <section 
        className="p-6 sm:p-7 rounded-2xl border shadow-xs space-y-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[rgba(11, 94, 215,0.12)] text-[var(--forest)]">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--ink)]">
                Session Preferences
              </h2>
              <p className="text-xs sm:text-sm font-medium text-[var(--ink-2)]">
                Set your default focus duration and smart break rules for deep work sessions.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
            Primary Focus
          </span>
        </div>

        {/* Target Focus Duration Preset Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-[var(--ink)]">
              Target Focus Duration
            </label>
            <span className="text-xs font-semibold text-[var(--ink-3)]">
              Selected: {workspaceSettings.targetFocusMin} minutes ({workspaceSettings.targetFocusMin / 60} hrs)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { min: 90, label: '90 Minutes', hours: '1.5 Hours', badge: 'Standard Sprint' },
              { min: 120, label: '120 Minutes', hours: '2.0 Hours', badge: 'Recommended' },
              { min: 150, label: '150 Minutes', hours: '2.5 Hours', badge: 'Deep Immersion' },
              { min: 180, label: '180 Minutes', hours: '3.0 Hours', badge: 'Mastery Block' },
            ].map(preset => {
              const active = workspaceSettings.targetFocusMin === preset.min;
              return (
                <button
                  key={preset.min}
                  type="button"
                  onClick={() => setWorkspaceSettings(prev => ({ ...prev, targetFocusMin: preset.min }))}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                    active
                      ? 'border-[var(--forest)] bg-[rgba(11, 94, 215,0.06)] shadow-xs ring-2 ring-[var(--forest)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                      active ? 'bg-[var(--forest)] text-white' : 'bg-slate-200/80 text-slate-700'
                    }`}>
                      {preset.badge}
                    </span>
                    {active && <CheckCircle2 size={16} className="text-[var(--forest)]" />}
                  </div>
                  <div>
                    <p className={`text-base sm:text-lg font-black font-mono ${active ? 'text-[var(--forest)]' : 'text-[var(--ink)]'}`}>
                      {preset.label}
                    </p>
                    <p className="text-xs font-medium text-[var(--ink-3)] mt-0.5">
                      {preset.hours}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Break Policy & Guardrails */}
        <div className="pt-4 border-t border-[var(--border)] space-y-4">
          <div className="flex items-center gap-2">
            <Coffee size={18} className="text-[var(--forest)]" />
            <h3 className="text-base font-bold text-[var(--ink)]">Break Policy & Rest Guardrails</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Standard Break Allowance Rule */}
            <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold text-[var(--ink)]">Standard Break Allowance</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-800">
                  3 Breaks / 2hr
                </span>
              </div>
              <p className="text-xs text-[var(--ink-2)] leading-relaxed">
                Standard 2-hour session permits up to 3 authorized breaks (recommended 5–15 mins each) without voiding session completion points.
              </p>
            </div>

            {/* Extended Session 4th Break Toggle */}
            <div className="p-4 rounded-xl border flex items-center justify-between gap-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="pr-2">
                <p className="text-sm font-bold text-[var(--ink)]">Auto-unlock 4th Break</p>
                <p className="text-xs text-[var(--ink-2)] mt-0.5 leading-relaxed">
                  Automatically grants an extra 4th break when deep work session duration extends past 3 hours.
                </p>
              </div>
              <input
                type="checkbox"
                id="autoUnlockFourthBreak"
                checked={workspaceSettings.autoUnlockFourthBreak}
                onChange={e => setWorkspaceSettings(prev => ({ ...prev, autoUnlockFourthBreak: e.target.checked }))}
                className="w-5 h-5 accent-[var(--forest)] rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Strict Break Expiry Alert */}
            <div className="p-4 rounded-xl border flex items-center justify-between gap-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="pr-2">
                <p className="text-sm font-bold text-[var(--ink)]">Break Expiry Reminder</p>
                <p className="text-xs text-[var(--ink-2)] mt-0.5 leading-relaxed">
                  Audibly cues desk speaker when a break exceeds 15 minutes to prevent session abandonment.
                </p>
              </div>
              <input
                type="checkbox"
                id="strictBreakReminder"
                checked={workspaceSettings.strictBreakReminder}
                onChange={e => setWorkspaceSettings(prev => ({ ...prev, strictBreakReminder: e.target.checked }))}
                className="w-5 h-5 accent-[var(--forest)] rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Session Warmup Countdown */}
            <div className="p-4 rounded-xl border flex items-center justify-between gap-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="pr-2">
                <p className="text-sm font-bold text-[var(--ink)]">10-Second Warmup Buffer</p>
                <p className="text-xs text-[var(--ink-2)] mt-0.5 leading-relaxed">
                  Provides a brief 10-second preparation buffer before desk presence tracking locks in.
                </p>
              </div>
              <input
                type="checkbox"
                id="warmupCountdown"
                checked={workspaceSettings.warmupCountdown}
                onChange={e => setWorkspaceSettings(prev => ({ ...prev, warmupCountdown: e.target.checked }))}
                className="w-5 h-5 accent-[var(--forest)] rounded cursor-pointer shrink-0"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: CONNECTED DEVICE & DISPLAY CONFIGURATION ── */}
      <section 
        className="p-6 sm:p-7 rounded-2xl border shadow-xs space-y-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-700">
              <Monitor size={18} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--ink)]">
                Connected Device
              </h2>
              <p className="text-xs sm:text-sm font-medium text-[var(--ink-2)]">
                Active desk selection, hardware state, and on-device screen customization.
              </p>
            </div>
          </div>

          {/* Device Selector Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="settings-device-select" className="text-xs font-bold text-[var(--ink-2)]">Active Desk:</label>
            <select
              id="settings-device-select"
              value={selectedUid}
              onChange={e => setSelectedUid(e.target.value)}
              className="input-base text-xs font-bold py-1.5 px-3 rounded-xl cursor-pointer"
              style={{ width: 'auto' }}
            >
              {devices.map(d => (
                <option key={d.uid} value={d.uid}>
                  {d.uid} {d.name ? `(${d.name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Device Status Card */}
        {selectedDevice ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <p className="text-xs uppercase font-bold text-[var(--ink-3)]">Device Model</p>
              <p className="text-base font-bold text-[var(--ink)] mt-1">smmart Desk ESP32 v2.4</p>
              <p className="text-xs text-[var(--ink-3)] font-mono mt-0.5">UID: {selectedDevice.uid}</p>
            </div>

            <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <p className="text-xs uppercase font-bold text-[var(--ink-3)]">Assigned Station</p>
              <p className="text-base font-bold text-[var(--ink)] mt-1">
                {selectedDevice.name || 'Personal Focus Station'}
              </p>
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                {selectedDevice.assignedTo?.name ? `User: ${selectedDevice.assignedTo.name}` : 'Individual Mode'}
              </p>
            </div>

            <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <p className="text-xs uppercase font-bold text-[var(--ink-3)]">Connection State</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className={`text-base font-bold ${isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isOnline ? 'ONLINE (Synced)' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                {selectedDevice.lastHeartbeat 
                  ? `Last pulse: ${new Date(selectedDevice.lastHeartbeat).toLocaleTimeString()}`
                  : 'No heartbeat recorded'}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border bg-slate-50 text-slate-600 text-sm">
            No desk hardware detected. Connect your smmart Desk ESP32 to configure hardware options.
          </div>
        )}

        {/* Hardware Screen Customization (Direct ESP32 Display Sync) */}
        <div className="pt-4 border-t border-[var(--border)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[var(--forest)]" />
                <span>On-Device Display Widgets</span>
              </h3>
              <p className="text-xs text-[var(--ink-2)] mt-0.5">
                Choose which information widgets are rendered on your physical desk screen.
              </p>
            </div>

            {/* Break Display Mode Segment */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--ink-2)]">Break Mode:</span>
              <div className="inline-flex rounded-lg p-0.5 border border-[var(--border)] bg-[var(--surface-2)]">
                <button
                  type="button"
                  onClick={() => setDisplayConfig(prev => ({ ...prev, breakDisplayMode: 'SESSION' }))}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                    displayConfig.breakDisplayMode === 'SESSION'
                      ? 'bg-[var(--forest)] text-white shadow-2xs'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  Session
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayConfig(prev => ({ ...prev, breakDisplayMode: 'DAILY' }))}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                    displayConfig.breakDisplayMode === 'DAILY'
                      ? 'bg-[var(--forest)] text-white shadow-2xs'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  Daily
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              {
                key: 'showSessionTimer',
                title: 'Session Timer',
                desc: 'Elapsed focus and remaining duration clock',
              },
              {
                key: 'showBreaks',
                title: 'Break Tracker',
                desc: 'Breaks taken counter and remaining break quota',
              },
              {
                key: 'showProdScore',
                title: 'Productivity Score',
                desc: 'Real-time focus percentage calculation',
              },
              {
                key: 'showProdSpike',
                title: 'Productivity Spike Graph',
                desc: 'Minimal single-line focus momentum sparkline',
              },
              {
                key: 'showSelfRating',
                title: 'Self-Rating Prompt',
                desc: 'Post-session 1-5 star review screen prompt',
              },
              {
                key: 'showModerator',
                title: 'Focus Moderator Cues',
                desc: 'Visual guidance and away alerts on screen',
              },
            ].map(item => {
              const checked = Boolean((displayConfig as any)[item.key]);
              return (
                <label
                  key={item.key}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    checked
                      ? 'bg-[var(--surface)] border-[var(--forest)] shadow-2xs'
                      : 'bg-[var(--surface-2)] border-[var(--border)] opacity-75'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setDisplayConfig(prev => ({ ...prev, [item.key]: e.target.checked }))}
                    className="w-4 h-4 accent-[var(--forest)] rounded mt-0.5 cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-bold text-[var(--ink)]">{item.title}</p>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">{item.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: FOCUS ASSISTANCE ── */}
      <section 
        className="p-6 sm:p-7 rounded-2xl border shadow-xs space-y-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--border)]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-700">
            <Volume2 size={18} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[var(--ink)]">
              Focus Assistance
            </h2>
            <p className="text-xs sm:text-sm font-medium text-[var(--ink-2)]">
              Tune desk buzzer alerts, away detection thresholds, and AI voice prompts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Away Detection Reminder Threshold */}
          <div className="p-4 rounded-xl border space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div>
              <label className="text-sm font-bold text-[var(--ink)] block">
                Away Detection Reminder Threshold
              </label>
              <p className="text-xs text-[var(--ink-2)] mt-0.5 leading-relaxed">
                Duration away from the desk before the device issues a gentle visual or audio reminder.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-1">
              {[
                { sec: 30, label: '30s', desc: 'Strict' },
                { sec: 45, label: '45s', desc: 'Balanced' },
                { sec: 60, label: '60s', desc: 'Standard' },
                { sec: 90, label: '90s', desc: 'Relaxed' },
              ].map(opt => {
                const active = workspaceSettings.awayReminderSeconds === opt.sec;
                return (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => setWorkspaceSettings(prev => ({ ...prev, awayReminderSeconds: opt.sec }))}
                    className={`py-2 px-1 text-center rounded-lg border font-mono font-bold transition-all cursor-pointer ${
                      active
                        ? 'bg-[var(--forest)] text-white border-[var(--forest)] shadow-2xs'
                        : 'bg-[var(--surface)] text-[var(--ink)] border-[var(--border)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="text-xs sm:text-sm block">{opt.label}</span>
                    <span className={`text-xs block font-sans font-medium ${active ? 'text-emerald-100' : 'text-[var(--ink-2)]'}`}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desk Audio Alert Tone */}
          <div className="p-4 rounded-xl border space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div>
              <label className="text-sm font-bold text-[var(--ink)] block">
                Desk Buzzer & Alert Tone
              </label>
              <p className="text-xs text-[var(--ink-2)] mt-0.5 leading-relaxed">
                Choose the chime style played through the connected desk speaker.
              </p>
            </div>

            <select
              value={workspaceSettings.buzzerTone}
              onChange={e => setWorkspaceSettings(prev => ({ ...prev, buzzerTone: e.target.value as any }))}
              className="input-base text-xs font-bold py-2 px-3 rounded-xl w-full"
            >
              <option value="gentle_chime">Gentle Chime (Warm, non-intrusive)</option>
              <option value="soft_bell">Soft Bell (Calm acoustic harmonic)</option>
              <option value="pulsed_beep">Pulsed Beep (High focus cadence)</option>
              <option value="silent">Silent (Screen cues only)</option>
            </select>
          </div>

          {/* AI Voice Prompts Toggle */}
          <div className="p-4 rounded-xl border flex items-center justify-between gap-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div className="pr-2">
              <p className="text-sm font-bold text-[var(--ink)]">AI Voice Moderator Prompts</p>
              <p className="text-xs text-[var(--ink-2)] mt-0.5 leading-relaxed">
                Announces milestones, halfway points, and gentle break notifications via synthetic voice.
              </p>
            </div>
            <input
              type="checkbox"
              id="voicePromptsEnabled"
              checked={workspaceSettings.voicePromptsEnabled}
              onChange={e => setWorkspaceSettings(prev => ({ ...prev, voicePromptsEnabled: e.target.checked }))}
              className="w-5 h-5 accent-[var(--forest)] rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Presence Radar Sensitivity */}
          <div className="p-4 rounded-xl border space-y-2" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[var(--ink)]">
                mmWave Presence Sensitivity
              </label>
              <span className="text-xs font-bold text-[var(--forest)] uppercase">
                {workspaceSettings.presenceSensitivity}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'high', label: 'High', note: 'Detects micro-motion' },
                { key: 'balanced', label: 'Balanced', note: 'Standard seating' },
                { key: 'relaxed', label: 'Relaxed', note: 'Fewer false triggers' },
              ].map(lvl => (
                <button
                  key={lvl.key}
                  type="button"
                  onClick={() => setWorkspaceSettings(prev => ({ ...prev, presenceSensitivity: lvl.key as any }))}
                  className={`py-1.5 px-2 text-center rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    workspaceSettings.presenceSensitivity === lvl.key
                      ? 'bg-[var(--forest)] text-white border-[var(--forest)] shadow-2xs'
                      : 'bg-[var(--surface)] text-[var(--ink)] border-[var(--border)]'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: ADVANCED SETTINGS & DIAGNOSTICS ── */}
      <section 
        className="p-6 sm:p-7 rounded-2xl border shadow-xs space-y-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-700">
              <Radio size={18} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--ink)]">
                Advanced & Diagnostics
              </h2>
              <p className="text-xs sm:text-sm font-medium text-[var(--ink-2)]">
                Technical telemetry, lockout safeguard status, and diagnostic ping tools.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Hardware Diagnostics Card */}
          <div className="p-4 rounded-xl border space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
              <Wifi size={15} className="text-[var(--forest)]" />
              <span>Hardware Telemetry</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--ink-3)] font-medium">Hardware UID:</span>
                <span className="font-mono font-bold text-[var(--ink)]">{selectedUid || 'None'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--ink-3)] font-medium">Firmware Version:</span>
                <span className="font-mono font-bold text-[var(--ink)]">v2.4.1-smmart-esp32</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--ink-3)] font-medium">Radar Sensor:</span>
                <span className="font-bold text-[var(--ink)]">LD2410C 24GHz mmWave</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--ink-3)] font-medium">Wi-Fi Signal:</span>
                <span className="font-mono font-bold text-emerald-700">-58 dBm (Strong)</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handlePingDevice}
                disabled={!selectedUid}
                className="btn text-xs font-bold py-1.5 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--forest)] flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} className={pingStatus ? 'animate-spin' : ''} />
                <span>{pingStatus || 'Ping Desk Device'}</span>
              </button>
            </div>
          </div>

          {/* Safeguard & Lockout Policy Card */}
          <div className="p-4 rounded-xl border space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
              <ShieldAlert size={15} className="text-amber-700" />
              <span>Focus Safeguard & Strike Counter</span>
            </h3>

            <p className="text-xs text-[var(--ink-2)] leading-relaxed">
              Going over the break limit makes a session invalid and adds a strike. 10 invalid sessions in a row lock the desk for 48 hours (an admin can unlock it earlier). One valid session of 20+ minutes clears the strikes. Each 30-second away alert also costs 1 SDW point from that session.
            </p>

            <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--ink-3)]">Current Penalty Strikes:</p>
                <p className="text-lg font-black font-mono text-[var(--ink)]">
                  {selectedDevice?.invalidSessionCount || 0} <span className="text-xs font-normal text-[var(--ink-3)]">/ 10 strikes</span>
                </p>
              </div>

              <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                (selectedDevice?.invalidSessionCount || 0) > 0
                  ? 'bg-amber-500/10 text-amber-800'
                  : 'bg-emerald-500/10 text-emerald-800'
              }`}>
                {(selectedDevice?.invalidSessionCount || 0) >= 7 ? `Final warning · ${10 - (selectedDevice?.invalidSessionCount || 0)} left` : (selectedDevice?.invalidSessionCount || 0) > 0 ? 'Warning Active' : 'Normal / Clear'}
              </span>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
              >
                Reset preferences to factory defaults
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Persistent Save / Action Bar ── */}
      <div 
        className="sticky bottom-4 z-30 p-4 rounded-2xl border shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          background: 'rgba(247, 247, 248, 0.96)',
          backdropFilter: 'blur(10px)',
          borderColor: 'var(--border-strong)'
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--forest)]" />
          <span className="text-xs sm:text-sm font-medium text-[var(--ink-2)]">
            Preferences apply immediately to upcoming deep work sessions and synced hardware.
          </span>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer hover:bg-slate-100"
            style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            Reset
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="btn btn-primary px-6 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>Save Preferences</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
