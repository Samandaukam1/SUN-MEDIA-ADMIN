/**
 * How a day of attendance reads, the same on the panel, the Rahbar's board and the staff cabinet. An employee who
 * has not pressed KELDIM is "Hali belgilanmagan" during their working day and only after their own end time
 * "Kelmagan — davomat tasdiqlanmagan" (which by itself does not prove they were away).
 */

export type DayRow = {
  status: string | null;
  arrived_at: string | null;
  late_minutes: number | null;
  work_start_time: string;
  work_end_time?: string | null;
  scheduled?: boolean | null;
  source?: string | null;
  corrected_by_name?: string | null;
};

export type DayStateKey = 'present' | 'late' | 'remote' | 'vacation' | 'excused' | 'absent' | 'unconfirmed' | 'waiting' | 'dayoff';
export type DayState = { key: DayStateKey; label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'neutral' };

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** "1 soat 6 daqiqa", "20 daqiqa". */
export function lateLabel(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  if (m < 60) return `${m} daqiqa`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} soat ${m % 60} daqiqa` : `${h} soat`;
}

/** `today` and `nowTime` ("HH:MM") are the agency's (Tashkent) date and time. */
export function dayState(row: DayRow, date: string, today: string, nowTime: string): DayState {
  switch (row.status) {
    case 'present':
      return { key: 'present', label: `Keldi — ${hhmm(row.arrived_at)}`.replace(/ — $/, ''), tone: 'success' };
    case 'late':
      return { key: 'late', label: `Kechikdi — ${hhmm(row.arrived_at)} (${lateLabel(row.late_minutes)})`, tone: 'warning' };
    case 'remote':
      return { key: 'remote', label: 'Masofadan ishlaydi', tone: 'info' };
    case 'vacation':
      return { key: 'vacation', label: 'Ta’tilda', tone: 'violet' };
    case 'excused':
      return { key: 'excused', label: 'Ruxsatli / dam olish', tone: 'violet' };
    case 'absent':
      return { key: 'absent', label: 'Kelmagan', tone: 'danger' };
  }
  if (row.scheduled === false) return { key: 'dayoff', label: 'Dam olish kuni', tone: 'neutral' };
  const end = hhmm(row.work_end_time) || '18:00';
  const over = date < today || (date === today && nowTime >= end);
  return over
    ? { key: 'unconfirmed', label: 'Kelmagan — davomat tasdiqlanmagan', tone: 'danger' }
    : { key: 'waiting', label: 'Hali belgilanmagan', tone: 'neutral' };
}

/** Who stands behind the record: the employee's own KELDIM or a correction. */
export function sourceLabel(row: Pick<DayRow, 'source' | 'corrected_by_name' | 'status'>): string | null {
  if (!row.status) return null;
  if (row.source === 'self') return row.corrected_by_name ? `KELDIM bosgan · tuzatdi: ${row.corrected_by_name}` : 'KELDIM — o‘zi tasdiqladi';
  return `Belgiladi: ${row.corrected_by_name ?? 'Rahbar'}`;
}

const tashkent = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' });
const tashkentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false });
export const agencyToday = (d = new Date()) => tashkent.format(d);
export const agencyNowTime = (d = new Date()) => tashkentTime.format(d);
