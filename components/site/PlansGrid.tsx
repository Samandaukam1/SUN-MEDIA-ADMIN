import { formatPrice, type SitePlan } from '@/lib/site/types';
import { ApplyButton } from './ApplyButton';
import { Reveal } from './motion';
import { SiteIcon } from './SiteIcon';

/** Grid that fits the number of tariffs: one centred card, two side by side, then three (or four) per row. */
function gridFor(count: number) {
  if (count === 1) return 'mx-auto max-w-md';
  if (count === 2) return 'mx-auto max-w-4xl md:grid-cols-2';
  if (count === 4) return 'md:grid-cols-2 xl:grid-cols-4';
  return 'md:grid-cols-2 lg:grid-cols-3';
}

function PlanPrice({ plan }: { plan: SitePlan }) {
  if (plan.priceMode === 'negotiable' || plan.price === null) {
    return (
      <div>
        <p className="font-display s-silver text-[32px] leading-tight font-medium tracking-[-0.03em]">Kelishiladi</p>
        <p className="mt-1.5 text-[13.5px] text-[#8e8e96]">Narx loyiha hajmiga qarab belgilanadi</p>
      </div>
    );
  }
  const price = formatPrice(plan.price, plan.currency);
  // Long prices (millions of so‘m) step down a size so three cards side by side still show them on one line.
  const size = price.length > 12 ? 'text-[26px] sm:text-[30px] lg:text-[23px] xl:text-[26px]' : 'text-[30px] sm:text-[34px]';
  return (
    <div>
      {plan.priceMode === 'from' ? <p className="mb-1 text-[12px] font-semibold tracking-[0.14em] text-[#d4fc18] uppercase">dan boshlab</p> : null}
      <p className={`font-display tabular leading-tight font-medium tracking-[-0.035em] text-white ${size}`}>{price}</p>
      <p className="mt-1.5 text-[13.5px] text-[#8e8e96]">{plan.billingPeriod === 'monthly' ? 'oyiga' : 'bir martalik to‘lov'}</p>
    </div>
  );
}

export function PlanCard({ plan }: { plan: SitePlan }) {
  return (
    <article
      className={`lg relative flex h-full flex-col rounded-[30px] p-7 sm:p-8 ${
        plan.isFeatured ? 'lg-strong shadow-[0_0_0_1px_rgb(212_252_24/0.55),0_30px_80px_-30px_rgb(212_252_24/0.4)]' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display min-w-0 text-[22px] leading-snug font-medium tracking-[-0.02em] break-words text-white">{plan.name}</h3>
        {plan.isFeatured ? (
          <span className="shrink-0 rounded-full bg-[#d4fc18] px-3 py-1 text-[11.5px] font-semibold tracking-wide text-[#0b0b0c]">Tavsiya etiladi</span>
        ) : null}
      </div>
      {plan.description ? <p className="mt-3 text-[14.5px] leading-relaxed break-words text-[#a8a8ac]">{plan.description}</p> : null}

      <div className="mt-7 border-b border-white/[0.07] pb-7">
        <PlanPrice plan={plan} />
      </div>

      {plan.items.length ? (
        <ul className="mt-7 space-y-3.5">
          {plan.items.map((item) => (
            <li key={item.id} className="grid grid-cols-[22px_1fr] gap-3">
              <span className="mt-0.5 grid size-[22px] place-items-center rounded-full bg-[#d4fc18]/12 text-[#d4fc18]">
                <SiteIcon name="check" size={13} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] leading-snug break-words text-[#e4e4e7]">
                  {item.name}
                  {item.quantity ? <span className="font-semibold text-white"> — {item.quantity}</span> : null}
                </p>
                {item.note ? <p className="mt-0.5 text-[13px] leading-snug break-words text-[#8e8e96]">{item.note}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto pt-8">
        <ApplyButton label="Tarifni tanlash" service={`Tarif: ${plan.name}`} variant={plan.isFeatured ? 'lime' : 'glass'} className="w-full" magnetic={false} />
      </div>
    </article>
  );
}

export function PlansGrid({ plans }: { plans: SitePlan[] }) {
  return (
    <div className={`grid items-stretch gap-4 ${gridFor(plans.length)}`}>
      {plans.map((plan, i) => (
        <Reveal key={plan.id} delay={(i % 3) * 0.07} className="h-full">
          <PlanCard plan={plan} />
        </Reveal>
      ))}
    </div>
  );
}
