import type { Metadata } from 'next';
import Link from 'next/link';

import { HomeLogoField } from '@/components/clients/HomeLogoField';
import { cellClass, rowClass, Table } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { Card, SectionTitle } from '@/components/ui/Card';
import { requireSystemOwner } from '@/lib/auth';
import { getPublicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Tizim sozlamalari' };

const KNOWN: Record<string, string> = {
  'attendance.work_days': 'Ish kunlari',
  'attendance.workday_start': 'Ish boshlanishi',
  'attendance.late_grace_minutes': 'Kechikish chegarasi (daqiqa)',
  'accounts.login_domain': 'Login domeni',
  'approvals.client_window_hours': 'Tekshiruv muddati (soat)',
};

/** Tizim boshqaruvi → Tizim sozlamalari: every platform setting as stored, plus where the platform runs. */
export default async function SystemSettingsPage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.from('app_settings').select('key, value, updated_at').order('key');
  if (error) throw error;
  const { data: agency } = await supabase.from('workspaces').select('home_logo_url, home_logo_dark_url').eq('kind', 'agency').maybeSingle();
  const host = new URL(getPublicEnv().url).host;

  return (
    <div className="space-y-8">
      <PageHeader title="Tizim sozlamalari" description="Platformaning barcha sozlamalari. Ish jadvali va eslatmalarni “Sozlamalar” bo‘limida o‘zgartirasiz." />
      <Card>
        <SectionTitle>Jamoa ilovasining markaziy logosi</SectionTitle>
        <p className="mb-4 text-sm text-muted">Bo‘sh qoldirilsa, asl SUN MEDIA logosi ishlatiladi: yorug‘ mavzuda kulrang original, qorong‘u mavzuda grafit varianti.</p>
        <div className="space-y-6">
          <HomeLogoField clientId={null} variant="light" current={agency?.home_logo_url ?? null} fallbackLabel="SUN MEDIA" />
          <HomeLogoField clientId={null} variant="dark" current={agency?.home_logo_dark_url ?? null} fallbackLabel="SUN MEDIA" />
        </div>
      </Card>
      <Card className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <SectionTitle>Baza</SectionTitle>
          <p className="font-mono">{host}</p>
        </div>
        <div>
          <SectionTitle>Muhit</SectionTitle>
          <p>{process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}</p>
        </div>
        <div>
          <SectionTitle>O‘zgartirish</SectionTitle>
          <Link href="/settings" className="font-medium underline">
            Ish jadvali va eslatmalar →
          </Link>
        </div>
      </Card>
      <Table columns={['Sozlama', 'Qiymat', 'O‘zgargan']}>
        {data.map((s) => (
          <tr key={s.key} className={rowClass}>
            <td className={cellClass}>
              <span className="block font-medium">{KNOWN[s.key] ?? s.key}</span>
              {KNOWN[s.key] ? <span className="block font-mono text-[12px] text-subtle">{s.key}</span> : null}
            </td>
            <td className={`${cellClass} max-w-md truncate font-mono text-[13px]`}>{JSON.stringify(s.value)}</td>
            <td className={`${cellClass} tabular whitespace-nowrap text-muted`}>{formatShortDateTime(s.updated_at)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
