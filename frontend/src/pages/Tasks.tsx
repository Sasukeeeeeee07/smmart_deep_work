import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Clock,
  BellRing
} from 'lucide-react';
import { soundFX } from '../utils/sound';
import { DEADLINE_ALERT_MINUTES, deadlineOf, minutesLeft, formatLeft } from '../utils/deadline';

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

interface Employee { _id: string; firstName: string; lastName: string; }
interface Task {
  _id: string; title: string; description?: string;
  status: TaskStatus; priority: TaskPriority;
  assignedTo?: Employee; dueDate?: string; dueHasTime?: boolean; createdAt: string;
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
  const left = isCompleted ? null : minutesLeft(task);
  const isOverdue = left !== null && left <= 0;
  const dueSoon = left !== null && left > 0 && task.dueHasTime && left <= DEADLINE_ALERT_MINUTES;
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
            {task.dueHasTime && `, ${due.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
            {isOverdue && ' · overdue'}
          </span>
        )}
        {dueSoon && left !== null && (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'rgba(245, 130, 32, 0.14)', color: '#B45F0C', border: '1px solid rgba(245, 130, 32, 0.4)' }}>
            <Clock size={10} /> Due in {formatLeft(left)}
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

/* ── MissedCard: a task that was not done (same card as the board) ───── */
function MissedCard({ task, onFinish }: { task: Task; onFinish: (t: Task) => void }) {
  const done = task.status === 'COMPLETED';
  const dl = deadlineOf(task);
  const p = PRIORITY_CFG[task.priority] || PRIORITY_CFG.MEDIUM;
  return (
    <div
      className="group relative rounded-xl border p-4 flex flex-col gap-3 transition-all duration-300 card-hover overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: done ? 'var(--border)' : 'rgba(215, 38, 46, 0.3)' }}
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertCircle size={18} className="mt-0.5 shrink-0" style={{ color: done ? 'var(--ink-4)' : '#D7262E' }} />
        <p className="text-sm font-semibold leading-snug break-words text-[var(--ink)]" style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>
          {task.title}
        </p>
      </div>

      {task.description && (
        <p className="text-xs leading-relaxed line-clamp-2 pl-6.5 text-[var(--ink-4)]">{task.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pl-6.5">
        {task.penaltyApplied ? (
          <span className="pill text-[10px]" style={{ color: '#D7262E', background: 'rgba(215, 38, 46, 0.1)', borderColor: 'rgba(215, 38, 46, 0.3)' }} title="SDW points deducted">
            -{task.penaltyPoints} pt
          </span>
        ) : (
          <span className="pill text-[10px]" style={{ color: 'var(--ink-4)', background: 'var(--surface-2)', borderColor: 'var(--border)' }} title="No employee profile is linked to this task, so no points were deducted">
            No points linked
          </span>
        )}
        <span className="pill text-[10px]" style={{ color: p.color, background: p.bg, borderColor: p.border }}>
          <Flag size={9} />
          {p.label}
        </span>
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-4)' }}>
          <Calendar size={10} />
          {task.missedReason === 'OVERDUE' && dl
            ? `Missed ${dl.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${task.dueHasTime ? `, ${dl.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}`
            : 'Logged by you'}
        </span>
      </div>

      <div className="flex items-center justify-between pt-2.5 mt-0.5" style={{ borderTop: '1px solid var(--border)' }} title="Finishing it late does not give the points back">
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--success)' }}>
            <Check size={12} strokeWidth={3} /> Done late
          </span>
        ) : (
          <button
            onClick={() => onFinish(task)}
            className="flex items-center gap-1 text-xs transition-colors cursor-pointer text-[var(--sage-dark)] hover:text-[var(--forest)] font-semibold"
          >
            <Check size={13} /> Finished it now
          </button>
        )}
      </div>
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
  const [showMissedForm, setShowMissedForm] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flaggedRef = useRef<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM' as TaskPriority, assignedTo: '', dueDate: '', dueTime: '',
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

  // Clock for the "due soon" warning. When a deadline passes, reload so the task moves to "Tasks I did not do".
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const passed = tasks.filter(t => t.status !== 'COMPLETED' && (minutesLeft(t, now) ?? 1) <= 0 && !flaggedRef.current.has(t._id));
    if (passed.length > 0) {
      passed.forEach(t => flaggedRef.current.add(t._id));
      fetchData();
    }
  }, [now, tasks, fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { dueTime, ...rest } = form;
      const withTime = !!form.dueDate && !!dueTime;
      await taskService.createTask({
        ...rest,
        assignedTo: form.assignedTo || undefined,
        // With a time the deadline is that exact moment (and the 30-minute warning applies); without one it is the end of the day
        dueDate: form.dueDate ? (withTime ? new Date(`${form.dueDate}T${dueTime}`).toISOString() : form.dueDate) : undefined,
        dueHasTime: withTime,
      });
      setShowModal(false);
      setForm({ title: '', description: '', priority: 'MEDIUM', assignedTo: '', dueDate: '', dueTime: '' });
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
      setMissedTitle(''); setMissedNote(''); setShowMissedForm(false);
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
  const dueSoon = tasks.filter(t => {
    const m = t.status === 'COMPLETED' || !t.dueHasTime ? null : minutesLeft(t, now);
    return m !== null && m > 0 && m <= DEADLINE_ALERT_MINUTES;
  });

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

      {/* ── 30-minute warning ── */}
      {!loading && dueSoon.length > 0 && (
        <div className="space-y-2" role="alert">
          {dueSoon.map(t => {
            const left = minutesLeft(t, now) ?? 0;
            const dl = deadlineOf(t)!;
            return (
              <div key={t._id} className="flex items-center gap-3 p-3.5 rounded-xl text-sm" style={{ background: 'rgba(245, 130, 32, 0.1)', border: '1px solid rgba(245, 130, 32, 0.45)', color: '#8A4708' }}>
                <BellRing size={16} className="shrink-0 bell-vibrate" />
                <p className="min-w-0">
                  <strong>"{t.title}"</strong> is due in {formatLeft(left)} (at {dl.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}).
                  Finish it in time or it moves to "Tasks I did not do" and costs {missed.penaltyPerTask} SDW point.
                </p>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ink-4)' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
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
          {/* ── Tasks I did not do: same column as the others ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 px-1 pb-3" style={{ borderBottom: '2px solid #D7262E' }}>
              <p className="font-semibold text-sm" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}>Tasks I did not do</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: '#D7262E', fontFamily: 'DM Sans, sans-serif' }}>
                {missed.tasks.length}
              </span>
              {missed.monthPenalty > 0 && (
                <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color: '#D7262E' }} title="SDW points lost this month">
                  -{missed.monthPenalty} pts
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              {showMissedForm ? (
                <form onSubmit={handleAddMissed} className="rounded-xl border p-3 space-y-2" style={{ background: 'var(--surface)', borderColor: 'rgba(215, 38, 46, 0.3)' }}>
                  <input
                    autoFocus
                    className="input-base"
                    placeholder="A task I did not do…"
                    value={missedTitle}
                    onChange={e => setMissedTitle(e.target.value)}
                    aria-label="Task you did not do"
                    maxLength={140}
                    style={{ fontSize: 13 }}
                  />
                  <input
                    className="input-base"
                    placeholder="Why? (optional)"
                    value={missedNote}
                    onChange={e => setMissedNote(e.target.value)}
                    aria-label="Reason"
                    maxLength={240}
                    style={{ fontSize: 13 }}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>Costs {missed.penaltyPerTask} SDW point.</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setShowMissedForm(false); setMissedTitle(''); setMissedNote(''); }} className="btn btn-secondary text-xs py-1.5 px-3">Cancel</button>
                    <button
                      type="submit"
                      disabled={addingMissed || !missedTitle.trim()}
                      className="btn text-xs py-1.5 px-3 font-bold text-white"
                      style={{ background: '#D7262E', borderColor: '#D7262E', opacity: addingMissed || !missedTitle.trim() ? 0.5 : 1 }}
                    >
                      {addingMissed ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Log as not done
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowMissedForm(true)}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:bg-[var(--surface-3)]"
                  style={{ border: '1.5px dashed rgba(215, 38, 46, 0.4)', color: '#D7262E', background: 'var(--surface-2)' }}
                >
                  <Plus size={13} /> Log a task I did not do
                </button>
              )}

              {missed.tasks.length === 0 ? (
                <div className="py-8 text-center rounded-xl text-xs" style={{ border: '1.5px dashed var(--border)', color: 'var(--ink-4)', background: 'var(--surface-2)' }}>
                  Nothing missed. Tasks that reach their deadline undone land here.
                </div>
              ) : (
                missed.tasks.map(t => <MissedCard key={t._id} task={t} onFinish={handleFinishLate} />)
              )}
            </div>
          </div>
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
                    onChange={e => setForm({ ...form, dueDate: e.target.value, dueTime: e.target.value ? form.dueTime : '' })}
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>

              {/* Due time */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Due time <span style={{ color: 'var(--ink-4)' }}>(optional)</span>
                </label>
                <input
                  type="time"
                  className="input-base"
                  value={form.dueTime}
                  disabled={!form.dueDate}
                  onChange={e => setForm({ ...form, dueTime: e.target.value })}
                  style={{ fontSize: 13 }}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--ink-4)' }}>
                  Set a time to get a warning {DEADLINE_ALERT_MINUTES} minutes before. Without one, the deadline is the end of that day.
                </p>
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
