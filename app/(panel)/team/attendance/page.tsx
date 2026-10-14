import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { withParams } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { LiveRefresh } from '@/components/panel/LiveRefresh';
import { EmptyRow } from '@/components/panel/Stat';
import { buttonClass } from '@/components/ui/Button';
import { AttendanceBoard, type RosterRow } from '@/components/team/AttendanceBoard';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addDaysToKey, agencyDateKey, formatDateKeyLong, isDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Davomat' };

/** Jamoa → Davomat: every employee presses KELDIM themselves (from 09:45); the Rahbar or an admin only corrects and flags errors. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'attendance.read') && !can(context, 'attendance.manage')) redirect('/no-access?reason=permission');
  const { date: dateParam } = await searchParams;
  const today = agencyDateKey();
  const date = isDateKey(dateParam) ? dateParam : today;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_attendance_day', { p_date: date });
  if (error) throw error;
  const { data: alerts } = await supabase.from('attendance_alerts').select('id, attendance_id, note').eq('status', 'open').eq('work_date', date);
  const alertOf = new Map((alerts ?? []).map((a) => [a.attendance_id, { id: a.id, note: a.note }]));
  const rows: RosterRow[] = data
    .filter((r) => r.scheduled || r.status)
    .map((r) => ({ ...r, alert: r.attendance_id ? (alertOf.get(r.attendance_id) ?? null) : null }));

  return (
    <div>
      <PageHeader
        title="Davomat"
        description={formatDateKeyLong(date)}
        actions={
          <div className="flex items-center gap-2">
            <LiveRefresh topics={['staff']} intervalMs={30_000} />
            <Link href={withParams('/team/attendance', { date: addDaysToKey(date, -1) })} className={buttonClass('secondary')} aria-label="Oldingi kun">
              ←
            </Link>
            {date !== today ? (
              <Link href="/team/attendance" className={buttonClass('secondary')}>
                Bugun
              </Link>
            ) : null}
            <Link href={withParams('/team/attendance', { date: addDaysToKey(date, 1) })} className={buttonClass('secondary')} aria-label="Keyingi kun">
              →
            </Link>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyRow>Bu kun dam olish kuni — ish jadvali bo‘yicha hech kim ishlamaydi.</EmptyRow>
      ) : (
        <AttendanceBoard rows={rows} date={date} isToday={date === today} canMark={can(context, 'attendance.manage')} />
      )}
    </div>
  );
}
