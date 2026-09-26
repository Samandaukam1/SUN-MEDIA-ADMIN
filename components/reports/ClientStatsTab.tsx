import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { PLATFORM_LABEL, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey } from '@/lib/time';
import { AddSocialAccountForm, SocialMonthForm } from './StatsForms';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

/** Client → Statistika: social accounts and the real monthly numbers the report is built from. */
export async function ClientStatsTab({ clientId, month, canEnter, canAddAccounts }: { clientId: string; month?: string; canEnter: boolean; canAddAccounts: boolean }) {
  const current = agencyDateKey().slice(0, 8) + '01';
  const active = month && /^\d{4}-\d{2}-01$/.test(month) && month <= current ? month : shiftMonth(current, -1);
  const supabase = await createClient();
  const { data: accounts, error } = await supabase
    .from('social_accounts')
    .select('id, platform, handle, url, metrics:social_metrics(period_start, followers_start, followers_end, reach, views, profile_visits, likes, comments, shares, saves, source, updated_at)')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('platform');
  if (error) throw error;
  const base = `/clients/${clientId}?tab=stats`;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href={`${base}&month=${shiftMonth(active, -1)}`} className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2">
            ← {monthLabel(shiftMonth(active, -1))}
          </Link>
          <p className="text-lg font-semibold">{monthLabel(active)}</p>
          {active < current ? (
            <Link href={`${base}&month=${shiftMonth(active, 1)}`} className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2">
              {monthLabel(shiftMonth(active, 1))} →
            </Link>
          ) : (
            <span className="w-24" />
          )}
        </div>
        {accounts.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Hali ijtimoiy tarmoq akkaunti qo‘shilmagan. O‘ng tomonda qo‘shing.</p>
          </Card>
        ) : (
          accounts.map((a) => {
            const m = a.metrics.find((x) => x.period_start === active) ?? null;
            return (
              <Card key={a.id}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{`${lookup(PLATFORM_LABEL, a.platform, a.platform)} · @${a.handle}`}</p>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-[13px] text-muted hover:underline">
                        {a.url}
                      </a>
                    ) : null}
                  </div>
                  {m ? <Badge tone="success">Kiritilgan</Badge> : <Badge tone="warning">Kiritilmagan</Badge>}
                </div>
                <SocialMonthForm
                  key={`${a.id}:${active}`}
                  clientId={clientId}
                  accountId={a.id}
                  month={active}
                  values={
                    m
                      ? {
                          followers_start: m.followers_start,
                          followers_end: m.followers_end,
                          reach: m.reach,
                          views: m.views,
                          profile_visits: m.profile_visits,
                          likes: m.likes,
                          comments: m.comments,
                          shares: m.shares,
                          saves: m.saves,
                        }
                      : null
                  }
                  editable={canEnter}
                />
              </Card>
            );
          })
        )}
      </div>
      {canAddAccounts ? (
        <Card className="h-fit">
          <SectionTitle>Akkaunt qo‘shish</SectionTitle>
          <AddSocialAccountForm clientId={clientId} />
          <p className="mt-4 text-[13px] text-muted">Raqamlar platformaning o‘z statistikasidan olinadi. SMM menejer har oy yakunida kiritadi.</p>
        </Card>
      ) : null}
    </div>
  );
}
