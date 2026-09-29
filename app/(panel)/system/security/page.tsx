import type { Metadata } from 'next';

import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow, Stat } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Xavfsizlik' };

type AuthEvent = { occurred_at: string; action: string; email: string | null; ip: string | null };

const ACTION: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info' }> = {
  login: { label: 'Kirdi', tone: 'success' },
  logout: { label: 'Chiqdi', tone: 'neutral' },
  user_signedup: { label: 'Akkaunt yaratildi', tone: 'info' },
  user_modified: { label: 'Akkaunt o‘zgardi', tone: 'warning' },
  user_deleted: { label: 'Akkaunt o‘chirildi', tone: 'danger' },
  user_updated_password: { label: 'Parol almashtirildi', tone: 'warning' },
  user_recovery_requested: { label: 'Parol tiklash so‘raldi', tone: 'warning' },
  token_revoked: { label: 'Sessiya bekor qilindi', tone: 'neutral' },
  token_refreshed: { label: 'Sessiya yangilandi', tone: 'neutral' },
};

/** Tizim boshqaruvi → Xavfsizlik: the rules the platform enforces and the latest sign-in events. */
export default async function SecurityPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const [eventsRes, blockedRes, ownersRes] = await Promise.all([
    supabase.rpc('system_auth_events', { p_limit: 60 }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('status', 'active').is('deleted_at', null),
    supabase.from('user_roles').select('user_id, role:roles!inner(key)').eq('role.key', 'system_owner'),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  const events = ((eventsRes.data ?? []) as AuthEvent[]).filter((e) => e.action !== 'token_refreshed');

  return (
    <div className="space-y-8">
      <PageHeader title="Xavfsizlik" description="Kim qachon kirgani va tizim qaysi qoidalarni majburiy ushlab turishi." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Tizim egasi akkauntlari" value={String(ownersRes.data?.length ?? 0)} />
        <Stat label="Bloklangan akkauntlar" value={String(blockedRes.count ?? 0)} tone={blockedRes.count ? 'warning' : 'default'} />
        <Stat label="So‘nggi kirishlar" value={String(events.filter((e) => e.action === 'login').length)} />
      </div>
      <Card className="space-y-2 text-sm">
        <SectionTitle>Majburiy qoidalar</SectionTitle>
        <p>• Har bir jadval qatorlar darajasida himoyalangan: mijoz faqat o‘z kompaniyasini ko‘radi.</p>
        <p>• Tizim egasi akkauntini hech kim — Admin ham — bloklay, rolini o‘zgartira yoki parolini tiklay olmaydi.</p>
        <p>• Login yaratish va parol tiklash faqat serverda bajariladi; maxfiy kalit brauzer va ilovaga chiqmaydi.</p>
        <p>• Parollar ochiq holda saqlanmaydi; vaqtinchalik parol faqat bir marta ko‘rsatiladi.</p>
      </Card>
      <section>
        <SectionTitle>So‘nggi hodisalar</SectionTitle>
        {events.length === 0 ? (
          <EmptyRow>Hodisa yo‘q</EmptyRow>
        ) : (
          <Table columns={['Qachon', 'Kim', 'Nima', 'IP']}>
            {events.map((e, i) => {
              const a = ACTION[e.action] ?? { label: e.action, tone: 'neutral' as const };
              return (
                <tr key={`${e.occurred_at}-${i}`} className={rowClass}>
                  <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{formatShortDateTime(e.occurred_at)}</td>
                  <td className={`${cellClass} font-mono text-[13px]`}>{e.email ?? '—'}</td>
                  <td className={cellClass}>
                    <Badge tone={a.tone}>{a.label}</Badge>
                  </td>
                  <td className={`${cellClass} font-mono text-[12px] text-muted`}>{e.ip ?? '—'}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}
