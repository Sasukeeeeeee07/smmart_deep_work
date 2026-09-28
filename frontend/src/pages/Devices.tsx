import { useState, useEffect, useCallback } from 'react';
import { deviceService, employeeService } from '../services/api';
import { Cpu, Wifi, WifiOff, User, UserCheck, Loader2 } from 'lucide-react';
import api from '../services/api';

interface Employee { _id: string; firstName: string; lastName: string; }
interface Device {
  _id: string;
  uid: string;
  name: string;
  status: string;
  lastHeartbeat: string;
  assignedTo?: Employee;
}

const Devices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
          <Cpu size={28} className="text-teal-400" />
          Devices
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Devices;
