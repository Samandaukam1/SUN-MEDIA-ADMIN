import Link from 'next/link';

import type { SiteCase } from '@/lib/site/types';
import { SiteIcon } from './SiteIcon';
import { initialsOf, SiteImage } from './SiteImage';

// Shared by the server-rendered grids and the client-side case filter (no server-only imports here).
function CaseCover({ item, large }: { item: SiteCase; large?: boolean }) {
  if (item.coverUrl) {
    return (
      <SiteImage
        src={item.coverUrl}
        alt={item.title}
        sizes={large ? '(min-width: 1024px) 1100px, 100vw' : '(min-width: 768px) 560px, 100vw'}
        className="object-cover transition-transform duration-[1.4s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
      />
    );
  }
  const name = item.partner?.name || item.clientName || item.title;
  return (
    <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_80%_10%,#2a2a2e,#0b0b0c_60%)]">
      <div className="s-grid-lines absolute inset-0 opacity-60" />
      <div className="absolute inset-0 grid place-items-center">
        {item.partner?.logoUrl ? (
          <div className="relative h-24 w-48">
            <SiteImage src={item.partner.logoUrl} alt={name} sizes="200px" className="object-contain opacity-90" />
          </div>
        ) : (
          <span className="font-display s-silver text-[64px] font-semibold tracking-[-0.04em]">{initialsOf(name)}</span>
        )}
      </div>
    </div>
  );
}

export function CaseCard({ item, large = false }: { item: SiteCase; large?: boolean }) {
  const client = item.partner?.name || item.clientName;
  return (
    <Link href={`/keyslar/${item.slug}`} className="group block h-full">
      <article className="lg flex h-full flex-col overflow-hidden rounded-[32px] p-2">
        <div className={`relative overflow-hidden rounded-[26px] ${large ? 'aspect-[16/10] sm:aspect-[21/10]' : 'aspect-[4/3]'}`}>
          <CaseCover item={item} large={large} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/10" />
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            {item.category ? <span className="lg rounded-full px-3 py-1 text-[12px] font-medium text-white">{item.category}</span> : null}
            {item.year ? <span className="lg rounded-full px-3 py-1 text-[12px] font-medium text-white tabular">{item.year}</span> : null}
          </div>
          <span className="absolute right-4 bottom-4 grid size-12 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c] opacity-0 shadow-[0_10px_30px_-6px_rgb(212_252_24/0.7)] transition-all duration-500 group-hover:-rotate-45 group-hover:opacity-100">
            <SiteIcon name="arrowRight" size={18} strokeWidth={2} />
          </span>
        </div>
        <div className="flex flex-1 flex-col px-4 pt-5 pb-4 sm:px-5">
          {client ? <p className="mb-2 text-[13px] font-medium tracking-wide text-[#8e8e96]">{client}</p> : null}
          <h3 className={`font-display font-medium tracking-[-0.025em] text-white ${large ? 'text-[24px] sm:text-[30px]' : 'text-[20px]'}`}>{item.title}</h3>
          <p className="mt-2 line-clamp-2 text-[14.5px] leading-relaxed text-[#a8a8ac]">{item.summary}</p>
          {item.results.length ? (
            <div className="mt-auto flex flex-wrap gap-x-8 gap-y-3 pt-6">
              {item.results.slice(0, 3).map((r) => (
                <div key={r.label + r.value}>
                  <p className="font-display text-[22px] leading-none font-medium tracking-[-0.03em] text-[#d4fc18]">{r.value}</p>
                  <p className="mt-1.5 text-[12.5px] text-[#8e8e96]">{r.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
