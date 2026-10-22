import { useState, useEffect, useCallback } from 'react';
import { notificationService } from '../services/api';
import { CheckCheck, Trash2, Cpu, ClipboardList, Info, BellOff } from 'lucide-react';

type NotifType = 'TASK' | 'DEVICE' | 'SYSTEM';
interface Notification {
  _id: string; type: NotifType; title: string;
  message: string; isRead: boolean; relatedId?: string; createdAt: string;
}

const TYPE_CFG: Record<NotifType, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  TASK:   { icon: ClipboardList, color: 'var(--forest)',  bg: 'rgba(66,84,67,0.08)',   border: 'rgba(66,84,67,0.2)' },
  DEVICE: { icon: Cpu,           color: 'var(--sage-dark)',bg: 'rgba(94,112,82,0.08)',  border: 'rgba(94,112,82,0.2)' },
  SYSTEM: { icon: Info,          color: 'var(--amber-w)', bg: 'rgba(184,121,57,0.1)',  border: 'rgba(184,121,57,0.2)' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const Notifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState<'ALL' | 'UNREAD'>('ALL');

  const fetchNotifs = useCallback(async () => {
    try {
      const data = await notificationService.getAll();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const markRead = async (id: string) => {
    setNotifications(p => p.map(n => n._id === id ? { ...n, isRead: true } : n));
    setUnreadCount(p => Math.max(0, p - 1));
    await notificationService.markAsRead(id);
  };

  const markAll = async () => {
    setNotifications(p => p.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await notificationService.markAllRead();
  };

  const del = async (id: string) => {
    const notif = notifications.find(n => n._id === id);
    setNotifications(p => p.filter(n => n._id !== id));
    if (notif && !notif.isRead) setUnreadCount(p => Math.max(0, p - 1));
    await notificationService.delete(id);
  };

  const filtered = filter === 'UNREAD' ? notifications.filter(n => !n.isRead) : notifications;

  return (
    <div className="space-y-6" style={{ maxWidth: 680 }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="section-label mb-0.5">Inbox</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(182,83,75,0.1)', color: 'var(--error)', border: '1px solid rgba(182,83,75,0.2)' }}
              >
                {unreadCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Filter tabs */}
          <div
            className="flex rounded-xl overflow-hidden text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {(['ALL', 'UNREAD'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 font-medium transition-all text-sm"
                style={{
                  background: filter === f ? 'var(--surface-2)' : 'transparent',
                  color: filter === f ? 'var(--ink)' : 'var(--ink-4)',
                  borderRight: f === 'ALL' ? '1px solid var(--border)' : undefined,
                }}
              >
                {f === 'ALL' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAll} className="btn btn-ghost text-sm gap-1.5" style={{ color: 'var(--sage-dark)' }}>
              <CheckCheck size={14} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <BellOff size={28} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>
            {filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(notif => {
            const cfg = TYPE_CFG[notif.type] || TYPE_CFG.SYSTEM;
            const Icon = cfg.icon;
            return (
              <div
                key={notif._id}
                onClick={() => !notif.isRead && markRead(notif._id)}
                className="group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer"
                style={{
                  background: notif.isRead ? 'var(--surface)' : 'var(--surface)',
                  borderColor: notif.isRead ? 'var(--border)' : 'var(--border-strong)',
                  opacity: notif.isRead ? 0.7 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                {/* Icon */}
                <div className="relative shrink-0 mt-0.5">
                  <div
                    className="flex items-center justify-center rounded-xl"
                    style={{ width: 36, height: 36, background: cfg.bg, border: `1px solid ${cfg.border}` }}
                  >
                    <Icon size={16} style={{ color: cfg.color }} />
                  </div>
                  {!notif.isRead && (
                    <span
                      className="absolute -top-0.5 -right-0.5 rounded-full border-2"
                      style={{ width: 10, height: 10, background: 'var(--error)', borderColor: 'var(--canvas)' }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className="text-sm font-semibold leading-tight" style={{ color: notif.isRead ? 'var(--ink-3)' : 'var(--ink)' }}>
                      {notif.title}
                    </p>
                    <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--ink-4)' }}>
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>{notif.message}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="pill text-xs"
                      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
                    >
                      {notif.type}
                    </span>
                    {!notif.isRead && (
                      <span className="text-xs" style={{ color: 'var(--ink-4)' }}>Click to mark read</span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); del(notif._id); }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--ink-4)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Notifications;
