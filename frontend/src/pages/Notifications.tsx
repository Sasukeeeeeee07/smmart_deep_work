import { useState, useEffect, useCallback } from 'react';
import { notificationService } from '../services/api';
import { Bell, CheckCheck, Trash2, Cpu, ClipboardList, Info, Loader2, BellOff } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = 'TASK' | 'DEVICE' | 'SYSTEM';

interface Notification {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  relatedId?: string;
  createdAt: string;
}

// ─── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  TASK:   { icon: ClipboardList, color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  DEVICE: { icon: Cpu,           color: 'text-teal-400',   bg: 'bg-teal-500/15   border-teal-500/30'   },
  SYSTEM: { icon: Info,          color: 'text-amber-400',  bg: 'bg-amber-500/15  border-amber-500/30'  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const Notifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationService.getAll();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n._id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    await notificationService.markAsRead(id);
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await notificationService.markAllRead();
  };

  const handleDelete = async (id: string) => {
    const notif = notifications.find(n => n._id === id);
    setNotifications(prev => prev.filter(n => n._id !== id));
    if (notif && !notif.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
    await notificationService.delete(id);
  };

  const filtered = filter === 'UNREAD'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
          <Bell size={28} className="text-amber-400" />
          Notifications
          {unreadCount > 0 && (
            <span className="ml-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {unreadCount}
            </span>
          )}
        </h2>

        <div className="flex items-center gap-3">
          {/* Filter tabs */}
          <div className="flex rounded-xl overflow-hidden border border-surface-light text-sm">
            {(['ALL', 'UNREAD'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 font-medium transition-colors ${
                  filter === f
                    ? 'bg-indigo-600/30 text-white border-r border-surface-light'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {f === 'ALL' ? 'All' : `Unread (${unreadCount})`}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-2 rounded-xl hover:bg-indigo-500/10"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          )}
        </div>
      </header>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-text-muted">
          <Loader2 size={28} className="animate-spin mr-3" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-text-muted gap-3 glass rounded-2xl border border-surface-light">
          <BellOff size={40} className="opacity-30" />
          <p>{filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(notif => {
            const cfg = TYPE_CONFIG[notif.type];
            const Icon = cfg.icon;
            return (
              <div
                key={notif._id}
                onClick={() => !notif.isRead && handleMarkRead(notif._id)}
                className={`group flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                  notif.isRead
                    ? 'glass border-surface-light opacity-60 hover:opacity-80'
                    : `glass border-surface-light hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10`
                }`}
              >
                {/* Unread indicator */}
                <div className="relative mt-1 shrink-0">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${cfg.bg}`}>
                    <Icon size={18} className={cfg.color} />
                  </div>
                  {!notif.isRead && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${notif.isRead ? 'text-text-muted' : 'text-text-main'}`}>
                      {notif.title}
                    </p>
                    <span className="text-xs text-text-muted shrink-0">{timeAgo(notif.createdAt)}</span>
                  </div>
                  <p className="text-sm text-text-muted mt-0.5 leading-relaxed">{notif.message}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>
                      {notif.type}
                    </span>
                    {!notif.isRead && (
                      <span className="text-xs text-indigo-400 group-hover:underline">Click to mark as read</span>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(notif._id); }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 text-text-muted hover:text-red-400 transition-all mt-1"
                  title="Delete notification"
                >
                  <Trash2 size={16} />
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
