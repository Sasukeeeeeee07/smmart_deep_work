import React, { useState, useEffect, useCallback } from 'react';
import { taskService, employeeService } from '../services/api';
import { 
  Plus, 
  X, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  Flag, 
  Calendar, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Circle, 
  Check,
  ShieldAlert
} from 'lucide-react';
import { soundFX } from '../utils/sound';

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

interface Employee { _id: string; firstName: string; lastName: string; }
interface Task {
  _id: string; title: string; description?: string;
  status: TaskStatus; priority: TaskPriority;
  assignedTo?: Employee; dueDate?: string; createdAt: string;
  missed?: boolean; missedAt?: string; missedReason?: 'OVERDUE' | 'MANUAL';
  penaltyApplied?: boolean; penaltyPoints?: number;
}
interface MissedData { tasks: Task[]; penaltyPerTask: number; monthPenalty: number; }

const COLUMNS: { key: TaskStatus; label: string; countColor: string }[] = [
  { key: 'TODO',        label: 'To do',       countColor: 'var(--ink-4)' },
  { key: 'IN_PROGRESS', label: 'In progress',  countColor: 'var(--amber-w)' },
  { key: 'COMPLETED',   label: 'Done',         countColor: 'var(--success)' },
];

const PRIORITY_CFG: Record<TaskPriority, { label: string; color: string; bg: string; border: string }> = {
  LOW:    { label: 'Low',    color: 'var(--ink-4)',    bg: 'var(--surface-2)',           border: 'var(--border)' },
  MEDIUM: { label: 'Medium', color: 'var(--amber-w)',  bg: 'rgba(184,121,57,0.1)',       border: 'rgba(184,121,57,0.25)' },
  HIGH:   { label: 'High',   color: 'var(--error)',    bg: 'rgba(182,83,75,0.1)',        border: 'rgba(182,83,75,0.25)' },
};

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];

/* ── TaskCard ─────────────────────────────────────────────────────────── */
function TaskCard({
  task, onDelete, onMoveLeft, onMoveRight, onToggleComplete, isFirst, isLast, isJustCompleted,
}: {
  task: Task; onDelete: (id: string) => void;
  onMoveLeft: (t: Task) => void; onMoveRight: (t: Task) => void;
  onToggleComplete: (t: Task) => void;
  isFirst: boolean; isLast: boolean;
  isJustCompleted?: boolean;
}) {
  const isCompleted = task.status === 'COMPLETED';
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due && due < new Date() && !isCompleted;
  const p = PRIORITY_CFG[task.priority];

  return (
    <div
      className={`group relative rounded-xl border p-4 flex flex-col gap-3 transition-all duration-300 card-hover overflow-hidden ${
        isCompleted ? 'ring-1 ring-emerald-500/30' : ''
      }`}
      style={{
        background: isCompleted
          ? 'linear-gradient(135deg, rgba(236, 253, 245, 0.6) 0%, rgba(255, 255, 255, 0.98) 100%)'
          : 'var(--surface)',
        borderColor: isCompleted ? 'rgba(52, 211, 153, 0.45)' : 'var(--border)',
      }}
    >
      {/* ── Completion Animation Layer Right Inside The Box ── */}
      {isJustCompleted && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1.5 animate-fade-in pointer-events-none rounded-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(167, 243, 208, 0.94) 0%, rgba(110, 231, 183, 0.96) 100%)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div className="w-12 h-12 rounded-full bg-emerald-700 text-white flex items-center justify-center shadow-lg animate-bounce">
            <CheckCircle2 size={28} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-emerald-950 bg-white/95 px-3 py-1 rounded-full shadow-xs border border-emerald-400 animate-pulse">
            Task Completed! 🎉
          </span>
        </div>
      )}

      {/* Title row with Complete Checkbox */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onToggleComplete(task)}
            className="mt-0.5 p-0.5 rounded-full transition-transform active:scale-75 cursor-pointer shrink-0"
            title={isCompleted ? 'Mark as incomplete' : 'Mark task completed'}
            aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
          >
            {isCompleted ? (
              <CheckCircle2 size={18} className="text-emerald-600 fill-emerald-100 transition-colors" />
            ) : (
              <Circle size={18} className="text-stone-300 hover:text-emerald-500 transition-colors" />
            )}
          </button>
          <p
            className={`text-sm font-semibold leading-snug break-words transition-all ${
              isCompleted ? 'line-through text-stone-500' : 'text-[var(--ink)]'
            }`}
          >
            {task.title}
          </p>
        </div>

        <button
          onClick={() => onDelete(task._id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all shrink-0 cursor-pointer text-[var(--ink-4)] hover:text-[var(--error)]"
          title="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p
          className={`text-xs leading-relaxed line-clamp-2 pl-6.5 ${
            isCompleted ? 'text-stone-400 line-through' : 'text-[var(--ink-4)]'
          }`}
        >
          {task.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2 pl-6.5">
        {isCompleted && (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Check size={11} strokeWidth={3} />
            Completed
          </span>
        )}
        <span
          className="pill text-[10px]"
          style={{ color: p.color, background: p.bg, borderColor: p.border }}
        >
          <Flag size={9} />
          {p.label}
        </span>
        {due && (
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: isOverdue ? 'var(--error)' : 'var(--ink-4)' }}
          >
            <Calendar size={10} />
            {due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            {isOverdue && ' · overdue'}
          </span>
        )}
      </div>

      {/* Assignee */}
      {task.assignedTo && (
        <div className="flex items-center gap-2 pl-6.5">
          <div
            className="flex items-center justify-center shrink-0 text-xs font-bold"
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(11, 94, 215,0.1)',
              color: 'var(--forest)',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {(task.assignedTo.firstName?.[0] || 'U').toUpperCase()}
          </div>
          <span className="text-xs" style={{ color: 'var(--ink-4)' }}>
            {task.assignedTo.firstName} {task.assignedTo.lastName}
          </span>
        </div>
      )}

      {/* Move buttons */}
      {(!isFirst || !isLast) && (
        <div
          className="flex items-center justify-between pt-2.5 mt-0.5"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {!isFirst ? (
            <button
              onClick={() => onMoveLeft(task)}
              className="flex items-center gap-1 text-xs transition-colors cursor-pointer text-[var(--ink-4)] hover:text-[var(--ink-2)]"
            >
              <ChevronLeft size={13} /> Move back
            </button>
          ) : <span />}
          {!isLast && (
            <button
              onClick={() => onMoveRight(task)}
              className="flex items-center gap-1 text-xs transition-colors cursor-pointer text-[var(--sage-dark)] hover:text-[var(--forest)] font-semibold"
            >
              Move forward <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */
const Tasks = () => {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [employees, setEmps]    = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [missed, setMissed] = useState<MissedData>({ tasks: [], penaltyPerTask: 1, monthPenalty: 0 });
  const [missedTitle, setMissedTitle] = useState('');
  const [missedNote, setMissedNote] = useState('');
  const [addingMissed, setAddingMissed] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM' as TaskPriority, assignedTo: '', dueDate: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [tasksData, empData, missedData] = await Promise.all([
        taskService.getAllTasks().catch(() => []),
        employeeService.getAllEmployees().catch(() => []),
        taskService.getMissedTasks().catch(() => null),
      ]);
      setTasks(tasksData || []);
      setEmps(empData || []);
      if (missedData) setMissed(missedData);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Failed to load tasks');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { 
    document.title = 'Tasks — smmart Desk';
    fetchData(); 
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await taskService.createTask({ ...form, assignedTo: form.assignedTo || undefined, dueDate: form.dueDate || undefined });
      setShowModal(false);
      setForm({ title: '', description: '', priority: 'MEDIUM', assignedTo: '', dueDate: '' });
      fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Failed to create task');
    } finally { setSubmitting(false); }
  };

  const handleAddMissed = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = missedTitle.trim();
    if (!title) return;
    if (!window.confirm(`Log "${title}" as a task you did not do? This costs you ${missed.penaltyPerTask} SDW point.`)) return;
    setAddingMissed(true);
    try {
      await taskService.addMissedTask({ title, description: missedNote.trim() || undefined });
      setMissedTitle(''); setMissedNote('');
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to log the missed task');
    } finally { setAddingMissed(false); }
  };

  const handleFinishLate = async (task: Task) => {
    try {
      await taskService.updateTaskStatus(task._id, 'COMPLETED', 'Finished late');
      await fetchData();
    } catch { setError('Failed to update task status'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    try { await taskService.deleteTask(id); setTasks(p => p.filter(t => t._id !== id)); }
    catch { setError('Failed to delete task'); }
  };

  const handleToggleComplete = async (task: Task) => {
    const isCompleted = task.status === 'COMPLETED';
    const nextStatus: TaskStatus = isCompleted ? 'IN_PROGRESS' : 'COMPLETED';

    if (!isCompleted) {
      soundFX.playEntrepreneurClick();
      setJustCompletedId(task._id);
      setTimeout(() => {
        setJustCompletedId(prev => (prev === task._id ? null : prev));
      }, 1600);
    } else {
      soundFX.playIndividualClick();
    }

    setTasks(p => p.map(t => t._id === task._id ? { ...t, status: nextStatus } : t));
    try {
      await taskService.updateTaskStatus(task._id, nextStatus);
    } catch {
      setError('Failed to update task status');
      fetchData();
    }
  };

  const handleMove = async (task: Task, dir: 'left' | 'right') => {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = dir === 'right' ? STATUS_ORDER[idx + 1] : STATUS_ORDER[idx - 1];
    if (!next) return;

    if (next === 'COMPLETED') {
      soundFX.playEntrepreneurClick();
      setJustCompletedId(task._id);
      setTimeout(() => {
        setJustCompletedId(prev => (prev === task._id ? null : prev));
      }, 1600);
    } else {
      soundFX.playIndividualClick();
    }

    setTasks(p => p.map(t => t._id === task._id ? { ...t, status: next } : t));
    try {
      await taskService.updateTaskStatus(task._id, next);
    } catch {
      setError('Failed to move task');
      fetchData();
    }
  };

  const byStatus = (s: TaskStatus) => tasks.filter(t => t.status === s);

  const COLUMN_ACCENT: Record<TaskStatus, string> = {
    TODO: 'var(--border)',
    IN_PROGRESS: 'var(--amber-w)',
    COMPLETED: 'var(--success)',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="section-label mb-0.5">Board</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Tasks
          </h1>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-primary text-sm">
          <Plus size={15} /> New task
        </button>
      </div>

      {error && (
        <div
          className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
          style={{ background: 'rgba(182,83,75,0.07)', border: '1px solid rgba(182,83,75,0.2)', color: 'var(--error)' }}
        >
          <AlertCircle size={15} />
          {error}
          <button className="ml-auto" onClick={() => setError(null)}><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ink-4)' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {COLUMNS.map(col => {
            const colTasks = byStatus(col.key);
            return (
              <div key={col.key} className="flex flex-col gap-3">
                {/* Column header */}
                <div
                  className="flex items-center gap-2.5 px-1 pb-3"
                  style={{ borderBottom: `2px solid ${COLUMN_ACCENT[col.key]}` }}
                >
                  <p
                    className="font-semibold text-sm"
                    style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
                  >
                    {col.label}
                  </p>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--surface-2)',
                      color: col.countColor,
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2.5">
                  {colTasks.length === 0 ? (
                    <div
                      className="py-8 text-center rounded-xl text-xs"
                      style={{
                        border: '1.5px dashed var(--border)',
                        color: 'var(--ink-4)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      No {col.label.toLowerCase()} tasks
                    </div>
                  ) : (
                    colTasks.map(task => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        onDelete={handleDelete}
                        onMoveLeft={t => handleMove(t, 'left')}
                        onMoveRight={t => handleMove(t, 'right')}
                        onToggleComplete={handleToggleComplete}
                        isFirst={col.key === STATUS_ORDER[0]}
                        isLast={col.key === STATUS_ORDER[STATUS_ORDER.length - 1]}
                        isJustCompleted={justCompletedId === task._id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Missed tasks: tasks I did not do (each one costs SDW points) ── */}
      {!loading && (
        <div className="rounded-2xl border p-5 md:p-6 space-y-4" style={{ background: 'var(--surface)', borderColor: 'rgba(215, 38, 46, 0.25)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(215, 38, 46, 0.1)', color: '#D7262E' }}>
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}>Tasks I did not do</h2>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  Tasks past their due date land here on their own. You can also log one yourself. Each costs {missed.penaltyPerTask} SDW point.
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase font-bold tracking-wide" style={{ color: 'var(--ink-4)' }}>Penalty this month</p>
              <p className="text-xl font-extrabold tabular-nums" style={{ color: missed.monthPenalty > 0 ? '#D7262E' : 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                {missed.monthPenalty > 0 ? `-${missed.monthPenalty}` : '0'} <span className="text-xs font-bold">pts</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleAddMissed} className="flex flex-col md:flex-row gap-2.5">
            <input
              className="input-base md:flex-[2]"
              placeholder="A task I did not do…"
              value={missedTitle}
              onChange={e => setMissedTitle(e.target.value)}
              aria-label="Task you did not do"
              maxLength={140}
            />
            <input
              className="input-base md:flex-[2]"
              placeholder="Why? (optional)"
              value={missedNote}
              onChange={e => setMissedNote(e.target.value)}
              aria-label="Reason"
              maxLength={240}
            />
            <button
              type="submit"
              disabled={addingMissed || !missedTitle.trim()}
              className="btn text-sm font-bold text-white shrink-0"
              style={{ background: '#D7262E', borderColor: '#D7262E', opacity: addingMissed || !missedTitle.trim() ? 0.5 : 1 }}
            >
              {addingMissed ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Log as not done
            </button>
          </form>

          {missed.tasks.length === 0 ? (
            <div className="py-6 text-center rounded-xl text-xs" style={{ border: '1.5px dashed var(--border)', color: 'var(--ink-4)', background: 'var(--surface-2)' }}>
              Nothing missed. Keep it that way.
            </div>
          ) : (
            <div className="space-y-2">
              {missed.tasks.map(t => {
                const done = t.status === 'COMPLETED';
                return (
                  <div key={t._id} className="flex items-center gap-3 rounded-xl border px-4 py-3 flex-wrap" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                        {t.missedReason === 'OVERDUE' && t.dueDate
                          ? `Due ${new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, not completed`
                          : 'Logged by you'}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                    <span
                      className="text-[11px] font-extrabold px-2.5 py-1 rounded-full tabular-nums"
                      style={{ background: t.penaltyApplied ? 'rgba(215, 38, 46, 0.1)' : 'var(--surface-3)', color: t.penaltyApplied ? '#D7262E' : 'var(--ink-3)' }}
                      title={t.penaltyApplied ? 'SDW points deducted' : 'No employee profile is linked to this task, so no points were deducted'}
                    >
                      {t.penaltyApplied ? `-${t.penaltyPoints} pt` : 'No points linked'}
                    </span>
                    {done ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(74, 124, 89, 0.12)', color: 'var(--success)' }}>Done late</span>
                    ) : (
                      <button onClick={() => handleFinishLate(t)} className="btn btn-secondary text-xs py-1.5 px-3">
                        <Check size={13} /> Finished it now
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>Finishing a task late does not give the points back.</p>
        </div>
      )}

      {/* ── Create Task Modal ─────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(41,43,37,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full animate-fade-up"
            style={{
              maxWidth: 480,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: 'var(--ink)' }}>
                Create task
              </h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost p-1.5 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Title <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  required
                  className="input-base"
                  placeholder="What needs to be done?"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Description <span style={{ color: 'var(--ink-4)' }}>(optional)</span>
                </label>
                <textarea
                  rows={2}
                  className="input-base resize-none"
                  placeholder="Add context…"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>Priority</label>
                  <select
                    className="input-base"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value as TaskPriority })}
                    style={{ fontSize: 13 }}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                {/* Due date */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Due date <span style={{ color: 'var(--ink-4)' }}>(optional)</span>
                  </label>
                  <input
                    type="date"
                    className="input-base"
                    value={form.dueDate}
                    onChange={e => setForm({ ...form, dueDate: e.target.value })}
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>

              {/* Assign */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Assign to <span style={{ color: 'var(--ink-4)' }}>(optional)</span>
                </label>
                <select
                  className="input-base"
                  value={form.assignedTo}
                  onChange={e => setForm({ ...form, assignedTo: e.target.value })}
                  style={{ fontSize: 13 }}
                >
                  <option value="">— Unassigned —</option>
                  {employees.map(emp => (
                    <option key={emp._id} value={emp._id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary text-sm">
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
