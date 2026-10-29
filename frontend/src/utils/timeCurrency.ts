/**
 * "Time currency": what a minute of the user's time is worth, derived from the
 * annual income they enter on the Profile page (stored with the rest of the
 * profile in localStorage under `smmart_profile`).
 */
export const WORKING_DAYS_PER_YEAR = 250;
export const WORKING_HOURS_PER_DAY = 8;

export function readAnnualIncome(): number {
  try {
    const raw = localStorage.getItem('smmart_profile');
    const n = Number(raw ? JSON.parse(raw).annualIncome : 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function timeValue(annualIncome: number) {
  const perDay = annualIncome / WORKING_DAYS_PER_YEAR;
  const perHour = perDay / WORKING_HOURS_PER_DAY;
  const perMinute = perHour / 60;
  return { perDay, perHour, perMinute };
}

/** ₹ with Indian digit grouping; whole rupees unless the value is small. */
export function formatRupees(value: number, maxFraction = 0) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: maxFraction, minimumFractionDigits: 0 })}`;
}
