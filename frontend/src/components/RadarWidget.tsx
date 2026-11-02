import React, { useState, useEffect, useCallback, useRef } from 'react';
import { deviceService } from '../services/api';
import { User, Minus, Plus } from 'lucide-react';

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
  const [data, setData]       = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const initialFetch = useRef(true);

  const fetchTelemetry = useCallback(async () => {
    try {
      const latest = await deviceService.getLatestActivity(deviceUid);
      setData(latest);
      setError(false);
    } catch {
      setError(true);
    } finally {
      if (initialFetch.current) {
        setLoading(false);
        initialFetch.current = false;
      }
    }
  }, [deviceUid]);

  useEffect(() => {
    initialFetch.current = true;
    setLoading(true);
    fetchTelemetry();
    const iv = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(iv);
  }, [fetchTelemetry]);

  const isOccupied = data?.state !== 'NO PERSON' && data?.state !== 'UNKNOWN' && data !== null;

  const stateLabel: Record<string, string> = {
    'MOVING':     'Active',
    'STATIONARY': 'Seated',
    'NO PERSON':  'Empty',
    'UNKNOWN':    'Unknown',
  };

  const lastSeen = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="card card-hover"
      style={{
        padding: 20,
        borderColor: isOccupied ? 'rgba(94, 112, 82, 0.35)' : undefined,
        transition: 'all 180ms ease',
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isOccupied ? 'rgba(11, 94, 215, 0.1)' : 'var(--surface-2)',
              }}
            >
              <User size={14} style={{ color: isOccupied ? 'var(--forest)' : 'var(--ink-4)' }} />
            </div>
            <p
              className="font-semibold text-sm leading-none"
              style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
            >
              {employeeName}
            </p>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-4)', marginLeft: 2 }}>
            {deviceUid}
          </p>
        </div>

        {/* Status pill */}
        <div
          className="pill"
          style={isOccupied
            ? { color: 'var(--success)', background: 'rgba(74, 124, 89, 0.1)', borderColor: 'rgba(74, 124, 89, 0.25)' }
            : { color: 'var(--ink-4)', background: 'var(--surface-2)', borderColor: 'var(--border)' }
          }
        >
          <span
            className="status-dot"
            style={{ background: isOccupied ? 'var(--success)' : 'var(--ink-4)', ...(isOccupied ? { animation: 'pulse-gentle 2s ease infinite' } : {}) }}
          />
          {data ? (stateLabel[data.state] || data.state) : 'Loading'}
        </div>
      </div>

      {/* Telemetry */}
      {loading ? (
        <div className="flex gap-3">
          <div className="skeleton h-16 flex-1 rounded-xl" />
          <div className="skeleton h-16 flex-1 rounded-xl" />
        </div>
      ) : error || !data ? (
        <div
          className="flex items-center justify-center h-16 rounded-xl text-xs"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-4)', border: '1px solid var(--border)' }}
        >
          No telemetry signal
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Moving', value: data.movingDistance, unit: 'cm', icon: Plus },
            { label: 'Static', value: data.stationaryDistance, unit: 'cm', icon: Minus },
          ].map(({ label, value, unit, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl p-3.5"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon size={12} style={{ color: 'var(--ink-4)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-4)' }}>{label}</span>
              </div>
              <p
                className="font-bold tabular-nums leading-none"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, color: 'var(--ink)' }}
              >
                {value}
                <span className="text-xs font-normal ml-1" style={{ color: 'var(--ink-4)' }}>{unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {lastSeen && (
        <p className="text-xs mt-3" style={{ color: 'var(--ink-4)' }}>
          Last seen at {lastSeen}
        </p>
      )}
    </div>
  );
};

export default RadarWidget;
