import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { CONTENT_TYPE, formatMoney } from '@/lib/labels';

export type SitePlanLine = {
  label: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  position: number | null;
  service: { name: string; unit: string; position: number; is_quantitative: boolean; content_types: string[] } | null;
};

type Props = {
  plan: { name: string; description: string | null; price: number; currency: string; is_active: boolean };
  site: { price_mode: string; billing_period: string } | null;
  lines: SitePlanLine[];
  canEditSite: boolean;
};

function counting(service: SitePlanLine['service']): string {
  if (!service) return '—';
  if (service.content_types.length) return `${service.name} · avtomatik: ${service.content_types.map((t) => CONTENT_TYPE[t as keyof typeof CONTENT_TYPE] ?? t).join(', ')}`;
  return `${service.name} · ${service.is_quantitative ? 'qo‘lda belgilanadi' : 'xizmat'}`;
}

/** A tariff mirrored from Sayt › Tariflar: shown here as it is, changed only there. */
export function SitePlanView({ plan, site, lines, canEditSite }: Props) {
  const sorted = [...lines].sort((a, b) => (a.position ?? a.service?.position ?? 0) - (b.position ?? b.service?.position ?? 0));
  const price =
    site?.price_mode === 'negotiable' ? 'Kelishiladi' : `${site?.price_mode === 'from' ? 'dan ' : ''}${formatMoney(plan.price, plan.currency)}`;
  return (
    <div className="max-w-3xl space-y-6">
      <Notice tone="info" title="Bu tarif saytdagi tarif bilan bitta">
        Nomi, narxi va tarkibi Sayt → Tariflar’da o‘zgartiriladi — o‘zgarish shu yerda, mijoz kabinetida va ilovada darhol ko‘rinadi. Mijozlar
        allaqachon olgan davr tarkibi o‘zgarmaydi.
      </Notice>
      <Card>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold tracking-tight">{price}</p>
            <p className="text-[13px] text-muted">{site?.billing_period === 'one_time' ? 'bir martalik' : 'oyiga'}</p>
          </div>
          {plan.is_active ? (
            <Badge tone="success" dot>
              Faol
            </Badge>
          ) : (
            <Badge dot>Yashirin — yangi mijozga biriktirilmaydi</Badge>
          )}
        </div>
        {plan.description ? <p className="mb-5 text-sm text-muted">{plan.description}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Xizmat</th>
                <th className="px-4 py-3">Miqdor</th>
                <th className="px-4 py-3">Tizimda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.label ?? l.service?.name}</p>
                    {l.note ? <p className="text-[12.5px] text-muted">{l.note}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">
                    {l.quantity != null ? `${l.quantity} ${l.unit ?? l.service?.unit ?? ''}` : l.service?.is_quantitative ? '∞ cheksiz' : '✓'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted">{counting(l.service)}</td>
                </tr>
              ))}
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted">
                    Tarkib belgilanmagan
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {canEditSite ? (
          <div className="mt-5 flex justify-end border-t border-line pt-5">
            <ButtonLink href="/site/plans" variant="primary">
              Sayt → Tariflar’da tahrirlash
            </ButtonLink>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
