import { useState, useEffect, useRef } from 'react';
import { deviceService, employeeService, taskService } from '../services/api';
import RadarWidget from '../components/RadarWidget';
import { Cpu, Users, ClipboardList, Wifi, CheckCircle, Clock, TrendingUp, Calendar, Activity, Zap } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';


// Dummy Data
const weeklyData = [
  { name: 'Mon', focus: 75, breaks: 25 },
  { name: 'Tue', focus: 82, breaks: 18 },
  { name: 'Wed', focus: 60, breaks: 40 },
  { name: 'Thu', focus: 90, breaks: 10 },
  { name: 'Fri', focus: 85, breaks: 15 },
  { name: 'Sat', focus: 40, breaks: 60 },
  { name: 'Sun', focus: 55, breaks: 45 },
];

const monthlyData = [
  { name: 'Week 1', productivity: 72 },
  { name: 'Week 2', productivity: 81 },
  { name: 'Week 3', productivity: 78 },
  { name: 'Week 4', productivity: 86 },
];

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalDevices: 0, onlineDevices: 0,
    totalEmployees: 0, activeEmployees: 0,
    totalTasks: 0, pendingTasks: 0, completedTasks: 0,
  });
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstFetch = useRef(true);

  useEffect(() => {
    const fetchAll = async () => {
      if (isFirstFetch.current) setLoading(true);
      else setRefreshing(true);
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
        if (isFirstFetch.current) {
          setLoading(false);
          isFirstFetch.current = false;
        }
        setRefreshing(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const averageMonthlyScore = 79.25; // Dummy average

  return (
    <div className="space-y-8 pb-10">
      <header className="flex items-center justify-between p-6 bg-gradient-to-r from-orange-500/10 to-amber-500/5 rounded-3xl border border-orange-500/20 shadow-lg">
        <div>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 flex items-center gap-3">
            <Zap className="text-orange-500" /> Focus Command Center
          </h2>
          <p className="text-text-muted text-sm mt-2">Empowering deep work and eliminating distractions</p>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-3 text-2xl font-bold text-orange-400">
            <TrendingUp /> {averageMonthlyScore}%
          </div>
          <p className="text-xs text-text-muted uppercase tracking-wider">Avg Monthly Productivity</p>
          {refreshing && (
            <span className="text-xs text-orange-400 flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse inline-block" /> Syncing
            </span>
          )}
        </div>
      </header>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Chart */}
        <div className="glass p-6 rounded-3xl border border-surface-light shadow-md">
          <h3 className="text-sm font-bold text-text-main uppercase tracking-wider mb-6 flex items-center gap-2">
            <Activity size={18} className="text-orange-400" /> Weekly Focus vs Breaks
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBreaks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '14px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="focus" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorFocus)" name="Focus Time (min)" />
                <Area type="monotone" dataKey="breaks" stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorBreaks)" name="Break Time (min)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Chart */}
        <div className="glass p-6 rounded-3xl border border-surface-light shadow-md">
          <h3 className="text-sm font-bold text-text-main uppercase tracking-wider mb-6 flex items-center gap-2">
            <Calendar size={18} className="text-amber-400" /> Monthly Productivity Score
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f8fafc' }}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar dataKey="productivity" fill="#fbbf24" radius={[6, 6, 0, 0]} name="Productivity (%)">
                  {monthlyData.map((entry, index) => (
                    <cell key={`cell-${index}`} fill={entry.productivity > 80 ? '#f59e0b' : '#fbbf24'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>


      {/* Device Radar Widgets */}
      <section>
        <h3 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
          <Cpu size={20} className="text-orange-400" />
          Live Device Feed
        </h3>
        {devices.length === 0 ? (
          <div className="glass rounded-3xl border border-dashed border-orange-500/30 p-12 text-center text-text-muted bg-orange-500/5">
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
