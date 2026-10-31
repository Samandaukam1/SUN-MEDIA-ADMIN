import { TaskGate } from '@/components/tasks/TaskGate';
import { getSessionContext } from '@/lib/auth';
import { loadGate } from '@/lib/tasks/gate';

/**
 * Every staff-cabinet page: today's KELDIM first when it is due, then the new tasks to accept (TaskGate). The pages
 * keep their own sign-in checks; signed-out or not-yet-ready accounts get the page alone.
 */
export default async function StaffCabinetLayout({ children }: { children: React.ReactNode }) {
  const context = await getSessionContext();
  const ready = !!context && context.kind === 'staff' && context.status === 'active' && !context.temporary_password;
  const gate = ready ? await loadGate(context.userId, (context.profile?.full_name ?? '').split(' ')[0] || undefined) : null;
  return (
    <>
      {children}
      {ready && gate ? <TaskGate userId={context.userId} gate={gate} area="staff" serverNow={new Date().toISOString()} /> : null}
    </>
  );
}
