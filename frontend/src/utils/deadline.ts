/** Warn this many minutes before a task deadline. Keep in step with the backend (DEADLINE_ALERT_MINUTES). */
export const DEADLINE_ALERT_MINUTES = 30;

interface Dated { dueDate?: string; dueHasTime?: boolean }

/** When a task is due: its date and time, or the end of that day if it has no time. */
export function deadlineOf(task: Dated): Date | null {
  if (!task.dueDate) return null;
  const d = new Date(task.dueDate);
  if (task.dueHasTime) return d;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

/** Minutes until the deadline (negative once it has passed), or null without a deadline. */
export function minutesLeft(task: Dated, now = Date.now()): number | null {
  const dl = deadlineOf(task);
  return dl ? Math.ceil((dl.getTime() - now) / 60000) : null;
}

/** "in 24 min", "in 2 h 5 min" */
export function formatLeft(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
