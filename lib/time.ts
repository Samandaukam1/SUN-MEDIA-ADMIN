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
