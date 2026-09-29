import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { RevokeButton } from '@/components/system/RevokeButton';
import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Sessiyalar' };

type Session = { user_id: string; full_name: string | null; email: string | null; sessions: number; last_active_at: string | null; user_agent: string | null; ip: string | null };

function device(agent: string | null): string {
  if (!agent) return '—';
  if (/iPhone|iPad|iOS/i.test(agent)) return 'iPhone / iPad';
  if (/Android/i.test(agent)) return 'Android';
  if (/Mac OS/i.test(agent)) return 'Mac';
  if (/Windows/i.test(agent)) return 'Windows';
  return agent.slice(0, 40);
}

/** Tizim boshqaruvi → Sessiyalar: who is signed in where; sign anyone out of every device. */
export default async function SessionsPage() {
  const context = await requireSystemOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('system_sessions');
  if (error) throw error;
  const rows = (data ?? []) as Session[];

  return (
    <div>
      <PageHeader title="Sessiyalar" description="Hozir tizimga kirgan akkauntlar. “Chiqarib yuborish” o‘sha odamni barcha qurilmalardan chiqaradi." />
      {rows.length === 0 ? (
        <EmptyRow>Faol sessiya yo‘q</EmptyRow>
      ) : (
        <Table columns={['Kim', 'Qurilma', 'Sessiyalar', 'Oxirgi faollik', '']}>
          {rows.map((s) => (
            <tr key={s.user_id} className={rowClass}>
              <td className={cellClass}>
                <span className="block font-medium">{s.full_name ?? '—'}</span>
                <span className="block font-mono text-[12px] text-muted">{s.email}</span>
              </td>
              <td className={`${cellClass} text-muted`}>{device(s.user_agent)}</td>
              <td className={`${cellClass} tabular`}>{s.sessions}</td>
              <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{s.last_active_at ? formatShortDateTime(s.last_active_at) : '—'}</td>
              <td className={cellClass}>
                <RevokeButton userId={s.user_id} disabled={s.user_id === context.userId} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
