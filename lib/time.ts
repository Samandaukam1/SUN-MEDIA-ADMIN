export const AGENCY_TIME_ZONE = 'Asia/Tashkent';

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: AGENCY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: AGENCY_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

/** "YYYY-MM-DD" of the agency (Tashkent) day. */
export function agencyDateKey(date: Date = new Date()): string {
  return dateKeyFormatter.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return timeFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateKeyLong(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
}

export function formatShortDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const key = agencyDateKey(new Date(value));
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}, ${formatTime(value)}`;
}

// Tashkent has no daylight saving: the agency day is always UTC+05:00.
const OFFSET = '+05:00';

/** "2026-09-29" → [from, to) ISO instants of that agency day. */
export function agencyDayRange(dateKey: string): { from: string; to: string } {
  return { from: `${dateKey}T00:00:00${OFFSET}`, to: `${addDaysToKey(dateKey, 1)}T00:00:00${OFFSET}` };
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week that contains dateKey. */
export function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDaysToKey(dateKey, -weekday);
}

export function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function addMonthsToKey(dateKey: string, months: number): string {
  const [y, m] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** "29 sentabr" (with the weekday when asked). */
export function formatDateKey(dateKey: string, withWeekday = false): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = `${d} ${MONTHS[m - 1]}`;
  return withWeekday ? `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${day}` : day;
}

export function formatMonthKey(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}

/** <input type="datetime-local"> value ("2026-09-29T14:00", agency time) → ISO instant. */
export function fromLocalInput(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00${OFFSET}` : null;
}

/** ISO instant → <input type="datetime-local"> value in agency time. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  return `${agencyDateKey(new Date(value))}T${formatTime(value)}`;
}
