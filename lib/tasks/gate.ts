import 'server-only';

import { agencyNowTime, agencyToday } from '@/lib/attendance';
import { createClient } from '@/lib/supabase/server';

import { toPending, type Gate } from './ack';
import { attendanceDue } from './deadline';

/**
 * What stands between this person and the app, confirmed by the server: today's KELDIM when it is due now (the
 * existing attendance rules), then every new task they have not accepted yet. A failed read never locks anyone out.
 */
export async function loadGate(userId: string, firstName?: string): Promise<Gate> {
  const supabase = await createClient();
  const now = new Date();
  const today = agencyToday(now);
  const [acks, employee, record, setting] = await Promise.all([
    supabase.rpc('get_my_pending_acks'),
    supabase.from('employees').select('status, work_days, hired_on, work_start_time, work_end_time').eq('user_id', userId).maybeSingle(),
    supabase.from('attendance').select('id').eq('user_id', userId).eq('work_date', today).maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'attendance.check_in_from').maybeSingle(),
  ]);
  const from = typeof setting.data?.value === 'string' ? setting.data.value : '09:45';
  const e = employee.data;
  const due =
    !!e &&
    !record.error &&
    attendanceDue({
      status: e.status,
      workDays: e.work_days,
      hiredOn: e.hired_on,
      hasRecord: !!record.data,
      today,
      nowTime: agencyNowTime(now),
      from,
      workEnd: e.work_end_time,
    });
  return {
    pending: acks.error ? [] : toPending(acks.data),
    day:
      due && e
        ? {
            record: null,
            from,
            workStart: e.work_start_time,
            serverNow: now.toISOString(),
            today,
            name: firstName,
          }
        : null,
  };
}
