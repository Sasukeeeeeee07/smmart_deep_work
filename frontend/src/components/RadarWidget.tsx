import React, { useState, useEffect } from 'react';
import { deviceService } from '../services/api';
import { Activity, User, Maximize } from 'lucide-react';

interface RadarWidgetProps {
  deviceUid: string;
  employeeName: string;
}

interface TelemetryData {
  state: string;
  movingDistance: number;
  stationaryDistance: number;
  timestamp: string;
}

const RadarWidget: React.FC<RadarWidgetProps> = ({ deviceUid, employeeName }) => {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchTelemetry = async () => {
    try {
      const latest = await deviceService.getLatestActivity(deviceUid);
      setData(latest);
      setError(false);
    } catch (err) {
      console.error('Failed to fetch telemetry', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry(); // Initial fetch
    // Poll every 3 seconds to match ESP32 transmit rate
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [deviceUid]);

  const isOccupied = data?.state !== 'NO PERSON' && data?.state !== 'UNKNOWN' && data !== null;

  return (
    <div className="glass p-6 rounded-2xl relative overflow-hidden transition-all duration-500 hover:shadow-[0_0_30px_rgba(34,197,94,0.1)]">
      {/* Background glow effect based on occupancy */}
      <div 
        className={`absolute -inset-4 opacity-20 blur-2xl transition-colors duration-1000 ${
          isOccupied ? 'bg-green-500' : 'bg-gray-500'
        }`}
      />
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
              <User size={20} className="text-blue-400" />
              {employeeName}'s Desk
            </h3>
            <p className="text-sm text-gray-400">Device: {deviceUid}</p>
          </div>
          
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border ${
            isOccupied 
              ? 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.3)]' 
              : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isOccupied ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
            {isOccupied ? 'Occupied' : 'Empty'}
          </div>
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="h-32 flex items-center justify-center text-red-400/80">
            Failed to load radar data
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                <Activity size={16} />
                Moving Dist.
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {data.movingDistance} <span className="text-sm text-gray-500">cm</span>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                <Maximize size={16} />
                Static Dist.
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {data.stationaryDistance} <span className="text-sm text-gray-500">cm</span>
              </div>
            </div>
            
            <div className="col-span-2 bg-white/5 rounded-xl p-3 border border-white/10 text-center">
              <span className="text-xs text-gray-400 uppercase tracking-wider">Raw State: </span>
              <span className="text-sm font-semibold text-blue-300">{data.state}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RadarWidget;
