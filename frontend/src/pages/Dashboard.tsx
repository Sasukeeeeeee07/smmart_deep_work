import { useState, useEffect } from 'react';
import { deviceService, employeeService, taskService } from '../services/api';
import RadarWidget from '../components/RadarWidget';
import { Cpu, Users, ClipboardList, Wifi, CheckCircle, Clock } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

const StatCard = ({ label, value, sub, icon: Icon, iconColor, iconBg }: StatCardProps) => (
  <div className="glass rounded-2xl border border-surface-light p-5 flex items-center gap-4 hover:border-indigo-500/30 transition-all">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg} shrink-0`}>
      <Icon size={22} className={iconColor} />
    </div>
    <div>
      <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-text-main">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalDevices: 0, onlineDevices: 0,
    totalEmployees: 0, activeEmployees: 0,
    totalTasks: 0, pendingTasks: 0, completedTasks: 0,
  });
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [devicesData, employeesData, tasksData] = await Promise.all([
          deviceService.getAllDevices(),
          employeeService.getAllEmployees(),
          taskService.getAllTasks(),
        ]);

        const onlineDevices = devicesData.filter((d: any) =>
          new Date().getTime() - new Date(d.lastHeartbeat).getTime() < 60000
        );

        setDevices(devicesData);
        setStats({
          totalDevices: devicesData.length,
          onlineDevices: onlineDevices.length,
          totalEmployees: employeesData.length,
          activeEmployees: employeesData.filter((e: any) => e.status === 'ACTIVE').length,
          totalTasks: tasksData.length,
          pendingTasks: tasksData.filter((t: any) => t.status !== 'COMPLETED').length,
          completedTasks: tasksData.filter((t: any) => t.status === 'COMPLETED').length,
        });
      } catch (err) {
        console.error('Dashboard fetch error', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-text-main">Overview</h2>
        <p className="text-text-muted text-sm mt-1">Real-time SmartDesk monitoring dashboard</p>
      </header>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl border border-surface-light p-5 h-20 animate-pulse bg-surface-light/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard label="Total Devices"   value={stats.totalDevices}    sub={`${stats.onlineDevices} online`}        icon={Cpu}           iconColor="text-teal-400"   iconBg="bg-teal-500/15 border border-teal-500/30" />
          <StatCard label="Online Now"      value={stats.onlineDevices}   sub="Last 60 seconds"                        icon={Wifi}          iconColor="text-green-400"  iconBg="bg-green-500/15 border border-green-500/30" />
          <StatCard label="Total Employees" value={stats.totalEmployees}  sub={`${stats.activeEmployees} active`}      icon={Users}         iconColor="text-indigo-400" iconBg="bg-indigo-500/15 border border-indigo-500/30" />
          <StatCard label="Total Tasks"     value={stats.totalTasks}      sub={`${stats.pendingTasks} pending`}        icon={ClipboardList} iconColor="text-amber-400"  iconBg="bg-amber-500/15 border border-amber-500/30" />
          <StatCard label="Completed Tasks" value={stats.completedTasks}  sub="All time"                               icon={CheckCircle}   iconColor="text-emerald-400" iconBg="bg-emerald-500/15 border border-emerald-500/30" />
          <StatCard label="Pending Tasks"   value={stats.pendingTasks}    sub="To Do + In Progress"                   icon={Clock}         iconColor="text-red-400"    iconBg="bg-red-500/15 border border-red-500/30" />
        </div>
      )}

      {/* Device Radar Widgets */}
      <section>
        <h3 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
          <Cpu size={20} className="text-teal-400" />
          Live Device Feed
        </h3>
        {devices.length === 0 ? (
          <div className="glass rounded-2xl border border-dashed border-surface-light p-10 text-center text-text-muted">
            No devices registered yet. Power on an ESP32 to see it here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device: any) => (
              <RadarWidget
                key={device.uid}
                deviceUid={device.uid}
                employeeName={
                  device.assignedTo
                    ? `${device.assignedTo.firstName} ${device.assignedTo.lastName}`
                    : device.name
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
