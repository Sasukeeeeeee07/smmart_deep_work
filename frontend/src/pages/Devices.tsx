import { useState, useEffect, useCallback } from 'react';
import { deviceService, employeeService } from '../services/api';
import { Cpu, Wifi, WifiOff, User, UserCheck, Loader2, Sliders, Clock, Calendar, Star, Zap, ShieldAlert, Check, X, Eye } from 'lucide-react';
import api from '../services/api';

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
  _id: string;
  uid: string;
  name: string;
  status: string;
  lastHeartbeat: string;
  assignedTo?: Employee;
  displayConfig?: DisplayConfig;
}

const defaultDisplayConfig: DisplayConfig = {
  breakDisplayMode: 'SESSION',
  showSessionTimer: true,
  showBreaks: true,
  showProdScore: true,
  showProdSpike: true,
  showSelfRating: true,
  showModerator: true,
};

const Devices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Customization Modal State
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [configDraft, setConfigDraft] = useState<DisplayConfig>(defaultDisplayConfig);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [devicesData, empData] = await Promise.all([
        deviceService.getAllDevices(),
        employeeService.getAllEmployees(),
      ]);
      setDevices(devicesData);
      setEmployees(empData);
    } catch (error) {
      console.error('Failed to fetch devices', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAssign = async (deviceId: string, employeeId: string) => {
    setAssigningId(deviceId);
    try {
      const response = await api.patch(`/devices/${deviceId}/assign`, {
        employeeId: employeeId || null,
      });
      setDevices(prev =>
        prev.map(d => d._id === deviceId ? { ...d, assignedTo: response.data.data.assignedTo } : d)
      );
    } catch (err) {
      console.error('Failed to assign device', err);
    } finally {
      setAssigningId(null);
    }
  };

  const openDisplayModal = async (device: Device) => {
    setSelectedDevice(device);
    setConfigSuccess(false);
    try {
      const config = await deviceService.getDisplayConfig(device.uid);
      setConfigDraft({ ...defaultDisplayConfig, ...config });
    } catch (err) {
      setConfigDraft(device.displayConfig || defaultDisplayConfig);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedDevice) return;
    setSavingConfig(true);
    try {
      await deviceService.updateDisplayConfig(selectedDevice.uid, configDraft);
      setDevices(prev =>
        prev.map(d => d.uid === selectedDevice.uid ? { ...d, displayConfig: configDraft } : d)
      );
      setConfigSuccess(true);
      setTimeout(() => {
        setSelectedDevice(null);
        setConfigSuccess(false);
      }, 900);
    } catch (err) {
      console.error('Failed to save display config', err);
      alert('Failed to save display preferences.');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
          <Cpu size={28} className="text-teal-400" />
          Devices & Desk Hardware
        </h2>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex items-center justify-center h-40 text-text-muted">
            <Loader2 size={28} className="animate-spin mr-3" /> Loading devices…
          </div>
        ) : devices.length === 0 ? (
          <div className="col-span-full glass p-10 text-center text-text-muted rounded-2xl border border-dashed border-surface-light">
            No devices registered. Power on an ESP32 to auto-register it.
          </div>
        ) : (
          devices.map((device) => {
            const isOnline = new Date().getTime() - new Date(device.lastHeartbeat).getTime() < 60000;
            const isAssigning = assigningId === device._id;

            return (
              <div key={device._id} className="glass p-6 rounded-2xl border border-surface-light hover:border-teal-500/30 hover:shadow-lg hover:shadow-teal-500/10 transition-all flex flex-col gap-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-text-main">{device.name}</h3>
                    <p className="text-sm text-text-muted font-mono mt-0.5">{device.uid}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    isOnline
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {isOnline
                      ? <Wifi size={13} className="animate-pulse" />
                      : <WifiOff size={13} />
                    }
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </div>
                </div>

                {/* Last seen */}
                <div className="flex justify-between text-sm border-t border-surface-light/50 pt-3">
                  <span className="text-text-muted">Last Seen:</span>
                  <span className="text-text-main">{new Date(device.lastHeartbeat).toLocaleTimeString()}</span>
                </div>

                {/* Assign Employee */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-muted flex items-center gap-1">
                    {device.assignedTo
                      ? <UserCheck size={12} className="text-teal-400" />
                      : <User size={12} />
                    }
                    Assigned Employee
                  </label>
                  <div className="relative">
                    <select
                      disabled={isAssigning}
                      value={device.assignedTo?._id || ''}
                      onChange={e => handleAssign(device._id, e.target.value)}
                      className="w-full bg-surface-dark border border-surface-light rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition-all appearance-none pr-8 disabled:opacity-50"
                    >
                      <option value="">— Unassigned —</option>
                      {employees.map(emp => (
                        <option key={emp._id} value={emp._id}>
                          {emp.firstName} {emp.lastName}
                        </option>
                      ))}
                    </select>
                    {isAssigning && (
                      <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-teal-400" />
                    )}
                  </div>
                </div>

                {/* Customize Display Button */}
                <button
                  onClick={() => openDisplayModal(device)}
                  className="mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium text-xs transition-all shadow-sm group"
                >
                  <Sliders size={14} className="group-hover:rotate-45 transition-transform" />
                  Customize Screen Display
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* CUSTOMIZE DISPLAY MODAL */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-dark border border-surface-light w-full max-w-xl rounded-2xl p-6 shadow-2xl flex flex-col gap-6 relative">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-surface-light/60 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sliders size={20} className="text-teal-400" />
                  Screen Display Settings
                </h3>
                <p className="text-xs text-text-muted mt-0.5 font-mono">
                  Device: {selectedDevice.name} ({selectedDevice.uid})
                </p>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="text-text-muted hover:text-white p-1 rounded-lg hover:bg-surface-light/40 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Section 1: Break Time Tracking Mode */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-text-main flex items-center gap-2">
                <Clock size={16} className="text-teal-400" />
                Break Time Format To Display
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfigDraft(prev => ({ ...prev, breakDisplayMode: 'SESSION' }))}
                  className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    configDraft.breakDisplayMode === 'SESSION'
                      ? 'bg-teal-500/15 border-teal-500 text-white shadow-sm'
                      : 'bg-surface-light/20 border-surface-light/60 text-text-muted hover:border-surface-light'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-teal-300">
                      <Clock size={14} /> Current Session
                    </span>
                    {configDraft.breakDisplayMode === 'SESSION' && (
                      <Check size={14} className="text-teal-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Shows break minutes taken during the active 2-hour session only.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setConfigDraft(prev => ({ ...prev, breakDisplayMode: 'DAILY' }))}
                  className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    configDraft.breakDisplayMode === 'DAILY'
                      ? 'bg-teal-500/15 border-teal-500 text-white shadow-sm'
                      : 'bg-surface-light/20 border-surface-light/60 text-text-muted hover:border-surface-light'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-teal-300">
                      <Calendar size={14} /> Whole Day Total
                    </span>
                    {configDraft.breakDisplayMode === 'DAILY' && (
                      <Check size={14} className="text-teal-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Shows cumulative breaks taken today across all sessions.
                  </p>
                </button>
              </div>
            </div>

            {/* Section 2: Widgets to Show/Hide */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-text-main flex items-center gap-2">
                <Eye size={16} className="text-teal-400" />
                Select Widgets To Display on Desk Screen
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    key: 'showSessionTimer',
                    label: 'Uninterrupted Session Timer',
                    desc: 'Countdown/active focus timer',
                    icon: Clock,
                  },
                  {
                    key: 'showBreaks',
                    label: 'Breaks Display Box',
                    desc: 'Break count & total duration',
                    icon: Calendar,
                  },
                  {
                    key: 'showProdScore',
                    label: 'Productivity Score',
                    desc: 'Calculated efficiency %',
                    icon: Zap,
                  },
                  {
                    key: 'showProdSpike',
                    label: 'Productivity Spike Indicator',
                    desc: 'High focus streak badge',
                    icon: Zap,
                  },
                  {
                    key: 'showSelfRating',
                    label: 'Self Rating Stars (1–5)',
                    desc: 'Interactive touch rating',
                    icon: Star,
                  },
                  {
                    key: 'showModerator',
                    label: 'Moderator / Alarms Bar',
                    desc: 'Audio commands & alert status',
                    icon: ShieldAlert,
                  },
                ].map(({ key, label, desc, icon: Icon }) => {
                  const isChecked = configDraft[key as keyof DisplayConfig] as boolean;
                  return (
                    <div
                      key={key}
                      onClick={() => setConfigDraft(prev => ({ ...prev, [key]: !isChecked }))}
                      className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between select-none transition-all ${
                        isChecked
                          ? 'bg-surface-light/30 border-teal-500/40 text-white'
                          : 'bg-surface-light/10 border-surface-light/40 text-text-muted opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} className={isChecked ? 'text-teal-400' : 'text-text-muted'} />
                        <div>
                          <p className="text-xs font-semibold leading-tight">{label}</p>
                          <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                        isChecked
                          ? 'bg-teal-500 border-teal-400 text-black'
                          : 'border-surface-light bg-surface-dark'
                      }`}>
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end items-center gap-3 border-t border-surface-light/60 pt-4">
              <button
                type="button"
                onClick={() => setSelectedDevice(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-white hover:bg-surface-light/40 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingConfig}
                onClick={handleSaveConfig}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-black transition-all disabled:opacity-50 shadow-lg shadow-teal-500/20"
              >
                {savingConfig ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving...
                  </>
                ) : configSuccess ? (
                  <>
                    <Check size={14} /> Saved & Synced!
                  </>
                ) : (
                  'Apply & Sync to Device'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Devices;
