import { penaltyService } from '../services/api';

const KEY_RE = /^smmart_wasted_(\d{4}-\d{2}-\d{2})$/;

/**
 * Hours typed on the Dashboard used to live only in this browser. Sends any of those entries to the
 * server once; days the server already has are kept as they are.
 */
export async function importLocalWastedTime(): Promise<void> {
  try {
    if (localStorage.getItem('smmart_wasted_imported') === '1') return;
    const entries: { date: string; minutes: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const m = KEY_RE.exec(localStorage.key(i) || '');
      if (!m) continue;
      const v = JSON.parse(localStorage.getItem(m[0]) || '{}');
      const minutes = Math.round((parseFloat(v.h) || 0) * 60 + (parseFloat(v.m) || 0));
      if (minutes > 0) entries.push({ date: m[1], minutes });
    }
    if (entries.length) await penaltyService.importWasted(entries);
    localStorage.setItem('smmart_wasted_imported', '1');
  } catch { /* try again next time */ }
}
