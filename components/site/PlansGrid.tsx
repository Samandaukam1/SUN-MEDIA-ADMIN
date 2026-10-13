import { formatPrice, quantityNumber, type SitePlan } from '@/lib/site/types';
import { Reveal } from './motion';
import { PlanCard } from './PlanCard';
import { SiteIcon } from './SiteIcon';

/** Grid that fits the number of tariffs: one centred card, two side by side, then three (or four) per row. */
function gridFor(count: number) {
  if (count === 1) return 'mx-auto max-w-lg';
  if (count === 2) return 'mx-auto max-w-5xl md:grid-cols-2';
  if (count === 4) return 'md:grid-cols-2 xl:grid-cols-4';
  return 'md:grid-cols-2 lg:grid-cols-3';
}

/** The tier that gets the lime light: the featured one, otherwise (two or more) the highest priced. */
function topPlanId(plans: SitePlan[]): string | null {
  const featured = plans.find((p) => p.isFeatured);
  if (featured) return featured.id;
  if (plans.length < 2) return null;
  const priced = plans.filter((p) => p.price !== null && p.priceMode !== 'negotiable');
  return priced.length ? priced.reduce((a, b) => (Number(b.price) > Number(a.price) ? b : a)).id : null;
}

/** Side by side: every service of every tariff, with the quantity each one includes. */
function PlanCompare({ plans, top }: { plans: SitePlan[]; top: string | null }) {
  const rows: { key: string; name: string }[] = [];
  for (const plan of plans) {
    for (const item of plan.items) {
      const key = item.name.trim().toLowerCase();
      if (!rows.some((r) => r.key === key)) rows.push({ key, name: item.name.trim() });
    }
  }
  if (rows.length < 2) return null;
  const cell = (plan: SitePlan, key: string) => plan.items.find((i) => i.name.trim().toLowerCase() === key) ?? null;

  return (
    <Reveal className="mt-20 sm:mt-28">
      <div className="mb-8 text-center">
        <p className="text-[12px] font-semibold tracking-[0.2em] text-[#d4fc18] uppercase">Solishtirish</p>
        <h3 className="font-display s-silver mt-3 text-[30px] leading-tight font-medium tracking-[-0.03em] sm:text-[40px]">Tariflarni yonma-yon ko‘ring</h3>
      </div>
      <div className="lg overflow-hidden rounded-[30px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="sticky left-0 z-10 bg-[#0b0b0d]/95 px-5 py-5 md:static md:bg-transparent text-[12px] font-semibold tracking-[0.14em] text-[#6e6e76] uppercase sm:px-7">Xizmat</th>
                {plans.map((p) => (
                  <th key={p.id} className="px-5 py-5 text-center sm:px-7">
                    <span className={`font-display block text-[16px] font-medium ${p.id === top ? 'text-[#d4fc18]' : 'text-white'}`}>{p.name}</span>
                    <span className="mt-1 block text-[12.5px] font-normal text-[#8e8e96]">
                      {p.priceMode === 'negotiable' || p.price === null ? 'Kelishiladi' : `${formatPrice(Number(p.price), p.currency)}${p.billingPeriod === 'monthly' ? ' / oy' : ''}`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => {
                const values = plans.map((p) => quantityNumber(cell(p, row.key)?.quantity));
                const best = values.filter((v): v is number => v !== null).length > 1 ? Math.max(...values.filter((v): v is number => v !== null)) : null;
                return (
                  <tr key={row.key} className={`border-b border-white/[0.05] last:border-0 ${r % 2 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="sticky left-0 z-10 bg-[#0b0b0d]/95 px-5 py-4 md:static md:bg-transparent text-[14.5px] text-[#e4e4e7] sm:px-7">{row.name}</td>
                    {plans.map((p, i) => {
                      const item = cell(p, row.key);
                      const isBest = best !== null && values[i] === best;
                      return (
                        <td key={p.id} className="px-5 py-4 text-center sm:px-7">
                          {!item ? (
                            <span className="text-[#3a3a3e]">—</span>
                          ) : item.quantity ? (
                            <span className={`inline-flex items-center gap-1.5 text-[14.5px] font-semibold tabular-nums ${isBest ? 'text-[#d4fc18]' : 'text-white'}`}>
                              {isBest ? <SiteIcon name="arrowUpRight" size={14} strokeWidth={2.2} /> : null}
                              {item.quantity}
                            </span>
                          ) : (
                            <span className="inline-grid size-6 place-items-center rounded-full bg-[#d4fc18]/12 text-[#d4fc18]">
                              <SiteIcon name="check" size={13} strokeWidth={2.6} />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Reveal>
  );
}

export function PlansGrid({ plans, compare = true }: { plans: SitePlan[]; compare?: boolean }) {
  const top = topPlanId(plans);
  return (
    <div className="relative">
      {/* drifting light behind the cards */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 -bottom-24 -z-0 overflow-hidden">
        <span className="s-drift absolute top-[10%] left-[8%] size-[420px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.16),transparent_65%)] blur-2xl" />
        <span className="s-drift absolute right-[6%] bottom-[5%] size-[380px] rounded-full bg-[radial-gradient(circle,rgb(244_244_245/0.08),transparent_65%)] blur-2xl [animation-delay:-8s]" />
      </div>
      <div className={`relative grid items-stretch gap-6 ${gridFor(plans.length)}`}>
        {plans.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} index={i} total={plans.length} top={plan.id === top} />
        ))}
      </div>
      {compare && plans.length > 1 ? <PlanCompare plans={plans} top={top} /> : null}
    </div>
  );
}
