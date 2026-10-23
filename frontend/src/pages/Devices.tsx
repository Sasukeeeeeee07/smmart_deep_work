import { useState, useEffect, useCallback } from 'react';
import { deviceService, employeeService } from '../services/api';
import api from '../services/api';
import {
  Cpu, Wifi, WifiOff, User, UserCheck, Loader2, Sliders,
  Clock, Calendar, Star, Zap, ShieldAlert, Check, X, Eye
} from 'lucide-react';

interface Employee { _id: string; firstName: string; lastName: string; }
interface DisplayConfig {
  breakDisplayMode: 'SESSION' | 'DAILY';
  showSessionTimer: boolean;
  showBreaks: boolean;
  showProdScore: boolean;
  showProdSpike: boolean;
  showSelfRating: boolean;
  showModerator: boolean;
}
interface Device {
  _id: string; uid: string; name: string;
  status: string; lastHeartbeat: string;
  assignedTo?: Employee; displayConfig?: DisplayConfig;
}

const defaultConfig: DisplayConfig = {
  breakDisplayMode: 'SESSION',
  showSessionTimer: true,
  showBreaks: true,
  showProdScore: true,
  showProdSpike: true,
  showSelfRating: true,
  showModerator: true,
};

const WIDGETS = [
  { key: 'showSessionTimer', label: 'Session timer',          desc: 'Countdown focus timer',           icon: Clock },
  { key: 'showBreaks',       label: 'Breaks display',         desc: 'Break count & total duration',    icon: Calendar },
  { key: 'showProdScore',    label: 'Productivity score',     desc: 'Calculated efficiency %',         icon: Zap },
  { key: 'showProdSpike',    label: 'Productivity spike',     desc: 'High focus streak badge',         icon: Zap },
  { key: 'showSelfRating',   label: 'Self rating (1–5)',      desc: 'Interactive touch rating',        icon: Star },
  { key: 'showModerator',    label: 'Moderator bar',          desc: 'Alarm & command status',          icon: ShieldAlert },
];

const Devices = () => {
  const [devices, setDevices]       = useState<Device[]>([]);
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]       = useState(true);
  const [assigningId, setAssigningId] = useState<string|null>(null);
  const [selected, setSelected]     = useState<Device|null>(null);
  const [draft, setDraft]           = useState<DisplayConfig>(defaultConfig);
  const [saving, setSaving]         = useState(false);
  const [saveOk, setSaveOk]         = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [devs, emps] = await Promise.all([
        deviceService.getAllDevices(),
        employeeService.getAllEmployees(),
      ]);
      setDevices(devs); setEmployees(emps);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    document.title = 'Devices — smmart Desk';
    fetchData();
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleAssign = async (deviceId: string, employeeId: string) => {
    setAssigningId(deviceId);
    try {
      const r = await api.patch(`/devices/${deviceId}/assign`, { employeeId: employeeId || null });
      setDevices(prev => prev.map(d => d._id === deviceId ? { ...d, assignedTo: r.data.data.assignedTo } : d));
    } catch {}
    finally { setAssigningId(null); }
  };

  const openModal = async (device: Device) => {
    setSelected(device); setSaveOk(false);
    try {
      const cfg = await deviceService.getDisplayConfig(device.uid);
      setDraft({ ...defaultConfig, ...cfg });
    } catch {
      setDraft(device.displayConfig || defaultConfig);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await deviceService.updateDisplayConfig(selected.uid, draft);
      setDevices(prev => prev.map(d => d.uid === selected.uid ? { ...d, displayConfig: draft } : d));
      setSaveOk(true);
      setTimeout(() => { setSelected(null); setSaveOk(false); }, 900);
    } catch {
      alert('Failed to save display preferences.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="section-label mb-0.5">Hardware</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          Devices
        </h1>
      </div>


      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-5 w-2/3 rounded-lg mb-3" />
              <div className="skeleton h-4 w-1/2 rounded-lg mb-5" />
              <div className="skeleton h-10 rounded-xl mb-3" />
              <div className="skeleton h-9 rounded-xl" />
            </div>
          ))
        ) : devices.length === 0 ? (
          <div
            className="col-span-full flex flex-col items-center justify-center py-16 rounded-xl"
            style={{ background: 'var(--surface-2)', border: '1.5px dashed var(--border-strong)' }}
          >
            <Cpu size={28} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>No devices registered</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Power on an ESP32 to auto-register it</p>
          </div>
        ) : devices.map(device => {
          const isOnline = Date.now() - new Date(device.lastHeartbeat).getTime() < 60000;
          const isAssigning = assigningId === device._id;

          return (
            <div
              key={device._id}
              className="card card-hover p-5 flex flex-col gap-4"
              style={{ borderColor: isOnline ? 'rgba(94, 112, 82, 0.3)' : undefined }}
            >
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: isOnline ? 'rgba(66, 84, 67, 0.1)' : 'var(--surface-2)',
                      }}
                    >
                      <Cpu size={15} style={{ color: isOnline ? 'var(--forest)' : 'var(--ink-4)' }} />
                    </div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                      {device.name}
                    </p>
                  </div>
                  <p className="text-xs font-mono" style={{ color: 'var(--ink-4)', marginLeft: 2 }}>{device.uid}</p>
                </div>
                <div className="pill" style={isOnline
                  ? { color: 'var(--success)', background: 'rgba(74,124,89,0.1)', borderColor: 'rgba(74,124,89,0.25)' }
                  : { color: 'var(--error)', background: 'rgba(182,83,75,0.1)', borderColor: 'rgba(182,83,75,0.25)' }
                }>
                  {isOnline ? <Wifi size={11} className="animate-pulse-gentle" /> : <WifiOff size={11} />}
                  {isOnline ? 'Online' : 'Offline'}
                </div>
              </div>

              {/* Last seen */}
              <div className="flex justify-between text-xs pb-3" style={{ borderBottom: '1px solid var(--border)', color: 'var(--ink-4)' }}>
                <span>Last ping</span>
                <span className="tabular-nums">{new Date(device.lastHeartbeat).toLocaleTimeString()}</span>
              </div>

              {/* Assign */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  {device.assignedTo ? <UserCheck size={12} style={{ color: 'var(--sage-dark)' }} /> : <User size={12} />}
                  Assigned to
                </label>
                <div className="relative">
                  <select
                    disabled={isAssigning}
                    value={device.assignedTo?._id || ''}
                    onChange={e => handleAssign(device._id, e.target.value)}
                    className="input-base pr-8 appearance-none disabled:opacity-50"
                    style={{ fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
                  >
                    <option value="">— Unassigned —</option>
                    {employees.map(emp => (
                      <option key={emp._id} value={emp._id}>{emp.firstName} {emp.lastName}</option>
                    ))}
                  </select>
                  {isAssigning && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--sage)' }} />
                  )}
                </div>
              </div>

              {/* Configure button */}
              <button
                onClick={() => openModal(device)}
                className="btn btn-secondary text-xs gap-2 justify-center"
              >
                <Sliders size={13} />
                Configure screen
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Display Config Modal ───────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(41, 43, 37, 0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div
            className="w-full animate-fade-up"
            style={{
              maxWidth: 520,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="font-semibold" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: 'var(--ink)' }}>
                  Screen display settings
                </h3>
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--ink-4)' }}>
                  {selected.name} — {selected.uid}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-ghost p-1.5 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Break time format */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} style={{ color: 'var(--sage)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Break time format</p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { val: 'SESSION', label: 'Current session', desc: 'Breaks during active 2-hr session' },
                    { val: 'DAILY',   label: 'Whole day',       desc: 'Cumulative breaks today' },
                  ] as const).map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setDraft(p => ({ ...p, breakDisplayMode: opt.val }))}
                      className="p-3.5 rounded-xl border text-left transition-all"
                      style={{
                        background: draft.breakDisplayMode === opt.val ? 'rgba(66, 84, 67, 0.08)' : 'var(--surface-2)',
                        borderColor: draft.breakDisplayMode === opt.val ? 'var(--sage-dark)' : 'var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: draft.breakDisplayMode === opt.val ? 'var(--forest)' : 'var(--ink-3)' }}>
                          {opt.label}
                        </span>
                        {draft.breakDisplayMode === opt.val && <Check size={12} style={{ color: 'var(--forest)' }} />}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--ink-4)', lineHeight: 1.4 }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Widget toggles */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={14} style={{ color: 'var(--sage)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Widgets to show on screen</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WIDGETS.map(({ key, label, desc, icon: Icon }) => {
                    const on = draft[key as keyof DisplayConfig] as boolean;
                    return (
                      <div
                        key={key}
                        onClick={() => setDraft(p => ({ ...p, [key]: !on }))}
                        className="flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all"
                        style={{
                          background: on ? 'rgba(66, 84, 67, 0.05)' : 'var(--surface-2)',
                          borderColor: on ? 'rgba(94, 112, 82, 0.4)' : 'var(--border)',
                          opacity: on ? 1 : 0.65,
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={14} style={{ color: on ? 'var(--sage-dark)' : 'var(--ink-4)' }} />
                          <div>
                            <p className="text-xs font-semibold" style={{ color: on ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</p>
                            <p className="text-xs" style={{ color: 'var(--ink-4)', fontSize: 10 }}>{desc}</p>
                          </div>
                        </div>
                        <div
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: 18, height: 18, borderRadius: 5,
                            background: on ? 'var(--forest)' : 'var(--surface)',
                            border: on ? 'none' : '1.5px solid var(--border-strong)',
                          }}
                        >
                          {on && <Check size={11} color="white" strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-1">
              <button onClick={() => setSelected(null)} className="btn btn-secondary text-sm">Cancel</button>
              <button
                disabled={saving}
                onClick={handleSave}
                className="btn btn-primary text-sm"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : saveOk ? <><Check size={14} /> Saved &amp; synced!</>
                : 'Apply to device'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Devices;
