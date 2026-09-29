import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { withParams } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { buttonClass } from '@/components/ui/Button';
import { AttendanceBoard, type RosterRow } from '@/components/team/AttendanceBoard';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addDaysToKey, agencyDateKey, formatDateKeyLong, isDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Davomat' };

/** Jamoa → Davomat: today's office roster; the admin marks everyone in under a minute. Employees never check themselves in. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'attendance.read') && !can(context, 'attendance.manage')) redirect('/no-access?reason=permission');
  const { date: dateParam } = await searchParams;
  const today = agencyDateKey();
  const date = isDateKey(dateParam) ? dateParam : today;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_attendance_day', { p_date: date });
  if (error) throw error;
  const rows: RosterRow[] = data.filter((r) => r.scheduled || r.status);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div>
      <PageHeader
        title="Davomat"
        description={formatDateKeyLong(date)}
        actions={
          <div className="flex gap-2">
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
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Jami" value={String(rows.length)} />
            <Stat label="Keldi" value={String(count('present') + count('late') + count('remote'))} tone="success" />
            <Stat label="Kechikdi" value={String(count('late'))} tone={count('late') ? 'warning' : 'default'} />
            <Stat label="Kelmadi" value={String(count('absent'))} tone={count('absent') ? 'danger' : 'default'} />
            <Stat label="Belgilanmagan" value={String(rows.filter((r) => !r.status).length)} tone={rows.some((r) => !r.status) ? 'warning' : 'default'} />
          </div>
          <AttendanceBoard rows={rows} date={date} isToday={date === today} canMark={can(context, 'attendance.manage')} />
        </>
      )}
    </div>
  );
}
