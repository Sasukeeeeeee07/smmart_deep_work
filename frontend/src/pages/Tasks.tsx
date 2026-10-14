import { useState, useEffect, useCallback } from 'react';
import { taskService, employeeService } from '../services/api';
import {
  ClipboardList, Plus, X, Trash2, ChevronRight, ChevronLeft,
  Flag, Calendar, User, Loader2, AlertCircle
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

interface Employee { _id: string; firstName: string; lastName: string; }
interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: Employee;
  dueDate?: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus; label: string; color: string; glow: string }[] = [
  { key: 'TODO',        label: 'To Do',       color: 'border-slate-500/40  bg-slate-500/10  text-slate-300',  glow: 'shadow-slate-500/20' },
  { key: 'IN_PROGRESS', label: 'In Progress',  color: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300', glow: 'shadow-indigo-500/20' },
  { key: 'COMPLETED',   label: 'Completed',    color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', glow: 'shadow-emerald-500/20' },
];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; cls: string }> = {
  LOW:    { label: 'Low',    cls: 'bg-slate-500/20  text-slate-400  border-slate-500/30' },
  MEDIUM: { label: 'Medium', cls: 'bg-amber-500/20  text-amber-400  border-amber-500/30' },
  HIGH:   { label: 'High',   cls: 'bg-red-500/20    text-red-400    border-red-500/30'   },
};

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];

// ─── Sub-components ───────────────────────────────────────────────────────────

const PriorityBadge = ({ priority }: { priority: TaskPriority }) => {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      <Flag size={10} />
      {cfg.label}
    </span>
  );
};

function TaskCard({
  task,
  onDelete,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast,
}: {
  task: Task;
  onDelete: (id: string) => void;
  onMoveLeft: (task: Task) => void;
  onMoveRight: (task: Task) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due && due < new Date() && task.status !== 'COMPLETED';

  return (
    <div className="glass rounded-xl border border-surface-light p-4 flex flex-col gap-3 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-text-main leading-snug flex-1">{task.title}</p>
        <button
          onClick={() => onDelete(task._id)}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all shrink-0"
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-text-muted leading-relaxed line-clamp-2">{task.description}</p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {due && (
          <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-400' : 'text-text-muted'}`}>
            <Calendar size={10} />
            {due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            {isOverdue && ' (overdue)'}
          </span>
        )}
      </div>

      {/* Assignee */}
      {task.assignedTo && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-[10px]">
            {task.assignedTo.firstName ? task.assignedTo.firstName.charAt(0) : 'U'}
          </div>
          <span>{task.assignedTo.firstName || ''} {task.assignedTo.lastName || ''}</span>
        </div>
      )}

      {/* Move buttons */}
      <div className="flex justify-end gap-2 mt-1">
        {!isFirst && (
          <button
            onClick={() => onMoveLeft(task)}
            className="text-xs flex items-center gap-1 text-text-muted hover:text-indigo-400 transition-colors"
          >
            <ChevronLeft size={14} /> Move back
          </button>
        )}
        {!isLast && (
          <button
            onClick={() => onMoveRight(task)}
            className="text-xs flex items-center gap-1 text-text-muted hover:text-emerald-400 transition-colors"
          >
            Move forward <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as TaskPriority,
    assignedTo: '',
    dueDate: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [tasksData, empData] = await Promise.all([
        taskService.getAllTasks().catch(() => []),
        employeeService.getAllEmployees().catch(() => []),
      ]);
      setTasks(tasksData || []);
      setEmployees(empData || []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await taskService.createTask({
        ...form,
        assignedTo: form.assignedTo || undefined,
        dueDate: form.dueDate || undefined,
      });
      setShowModal(false);
      setForm({ title: '', description: '', priority: 'MEDIUM', assignedTo: '', dueDate: '' });
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await taskService.deleteTask(id);
      setTasks(prev => prev.filter(t => t._id !== id));
    } catch {
      setError('Failed to delete task');
    }
  };

  const handleMove = async (task: Task, direction: 'left' | 'right') => {
    const idx = STATUS_ORDER.indexOf(task.status);
    const newStatus = direction === 'right' ? STATUS_ORDER[idx + 1] : STATUS_ORDER[idx - 1];
    if (!newStatus) return;

    // Optimistic update
    setTasks(prev => prev.map(t => t._id === task._id ? { ...t, status: newStatus } : t));
    try {
      await taskService.updateTaskStatus(task._id, newStatus);
    } catch {
      setError('Failed to move task');
      await fetchData(); // Revert on error
    }
  };

  const tasksByStatus = (status: TaskStatus) => tasks.filter(t => t.status === status);

  return (
    <div className="space-y-6 h-full">
      {/* Header */}
      <header className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
          <ClipboardList size={28} className="text-indigo-400" />
          Tasks
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-indigo-500/30 active:scale-95 font-medium text-sm"
        >
          <Plus size={18} /> New Task
        </button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={16} />
          {error}
          <button className="ml-auto text-red-300 hover:text-red-200" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-text-muted">
          <Loader2 size={32} className="animate-spin mr-3" /> Loading tasks…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {COLUMNS.map((col, colIdx) => {
            const colTasks = tasksByStatus(col.key);
            return (
              <div key={col.key} className="flex flex-col gap-3">
                {/* Column header */}
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${col.color}`}>
                  <span className="text-sm font-semibold tracking-wide">{col.label}</span>
                  <span className="text-xs font-bold opacity-70 bg-white/10 px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                {/* Task cards */}
                <div className="space-y-3 min-h-[120px]">
                  {colTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-20 rounded-xl border border-dashed border-surface-light text-text-muted text-sm">
                      No tasks here
                    </div>
                  ) : (
                    colTasks.map(task => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        onDelete={handleDelete}
                        onMoveLeft={(t) => handleMove(t, 'left')}
                        onMoveRight={(t) => handleMove(t, 'right')}
                        isFirst={colIdx === 0}
                        isLast={colIdx === COLUMNS.length - 1}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass p-8 rounded-2xl w-full max-w-lg border border-surface-light shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-text-main">New Task</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">Title <span className="text-red-400">*</span></label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Configure sensor threshold"
                  className="w-full bg-surface-dark border border-surface-light rounded-xl px-4 py-2.5 text-white placeholder-text-muted/50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">Description</label>
                <textarea
                  rows={3}
                  placeholder="Optional details…"
                  className="w-full bg-surface-dark border border-surface-light rounded-xl px-4 py-2.5 text-white placeholder-text-muted/50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* Priority + Assign row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">
                    <Flag size={12} className="inline mr-1" />Priority
                  </label>
                  <select
                    className="w-full bg-surface-dark border border-surface-light rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-all"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5">
                    <User size={12} className="inline mr-1" />Assign To
                  </label>
                  <select
                    className="w-full bg-surface-dark border border-surface-light rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-all"
                    value={form.assignedTo}
                    onChange={e => setForm({ ...form, assignedTo: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {employees.map(emp => (
                      <option key={emp._id} value={emp._id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm text-text-muted mb-1.5">
                  <Calendar size={12} className="inline mr-1" />Due Date
                </label>
                <input
                  type="date"
                  className="w-full bg-surface-dark border border-surface-light rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-all"
                  value={form.dueDate}
                  onChange={e => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-text-muted hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all font-medium text-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {submitting ? 'Creating…' : 'Create Task'}
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
