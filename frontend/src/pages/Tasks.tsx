import React, { useState, useEffect, useCallback } from 'react';
import { taskService, employeeService } from '../services/api';
import { Plus, X, Trash2, ChevronRight, ChevronLeft, Flag, Calendar, Loader2, AlertCircle } from 'lucide-react';

type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

interface Employee { _id: string; firstName: string; lastName: string; }
interface Task {
  _id: string; title: string; description?: string;
  status: TaskStatus; priority: TaskPriority;
  assignedTo?: Employee; dueDate?: string; createdAt: string;
}

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
  task, onDelete, onMoveLeft, onMoveRight, isFirst, isLast,
}: {
  task: Task; onDelete: (id: string) => void;
  onMoveLeft: (t: Task) => void; onMoveRight: (t: Task) => void;
  isFirst: boolean; isLast: boolean;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due && due < new Date() && task.status !== 'COMPLETED';
  const p = PRIORITY_CFG[task.priority];

  return (
    <div
      className="group rounded-xl border p-4 flex flex-col gap-3 transition-all duration-150 card-hover"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug flex-1" style={{ color: 'var(--ink)' }}>
          {task.title}
        </p>
        <button
          onClick={() => onDelete(task._id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all shrink-0"
          style={{ color: 'var(--ink-4)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--ink-4)' }}>
          {task.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="pill"
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
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center shrink-0 text-xs font-bold"
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(66,84,67,0.1)',
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
          className="flex items-center justify-between pt-2.5"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {!isFirst ? (
            <button
              onClick={() => onMoveLeft(task)}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--ink-4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
            >
              <ChevronLeft size={13} /> Move back
            </button>
          ) : <span />}
          {!isLast && (
            <button
              onClick={() => onMoveRight(task)}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--sage-dark)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--forest)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--sage-dark)')}
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
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM' as TaskPriority, assignedTo: '', dueDate: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [tasksData, empData] = await Promise.all([
        taskService.getAllTasks().catch(() => []),
        employeeService.getAllEmployees().catch(() => []),
      ]);
      setTasks(tasksData || []);
      setEmps(empData || []);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Failed to load tasks');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    try { await taskService.deleteTask(id); setTasks(p => p.filter(t => t._id !== id)); }
    catch { setError('Failed to delete task'); }
  };

  const handleMove = async (task: Task, dir: 'left' | 'right') => {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = dir === 'right' ? STATUS_ORDER[idx + 1] : STATUS_ORDER[idx - 1];
    if (!next) return;
    setTasks(p => p.map(t => t._id === task._id ? { ...t, status: next } : t));
    try { await taskService.updateTaskStatus(task._id, next); }
    catch { setError('Failed to move task'); fetchData(); }
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
                        isFirst={col.key === STATUS_ORDER[0]}
                        isLast={col.key === STATUS_ORDER[STATUS_ORDER.length - 1]}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
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
