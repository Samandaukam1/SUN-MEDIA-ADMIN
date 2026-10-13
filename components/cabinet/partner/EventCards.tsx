import { SiteIcon } from '@/components/site/SiteIcon';
import type { CabinetEvent } from '@/lib/cabinet/partner-data';
import { CONTENT_TYPE, PLATFORM_LABEL, SHOOTING_STATUS, lookup } from '@/lib/labels';
import { agencyDateKey, formatDateKey, formatTime } from '@/lib/time';

const SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

/** A SUN MEDIA visit (shooting): the day, the time window, where, and its state. */
export function VisitCard({ event, muted = false }: { event: CabinetEvent; muted?: boolean }) {
  const key = agencyDateKey(new Date(event.starts_at));
  const [, m, d] = key.split('-').map(Number);
  const status = lookup(SHOOTING_STATUS, event.status, { label: event.status ?? '', tone: 'neutral' as const });
  return (
    <div className={`lg flex gap-4 rounded-[22px] p-4 sm:p-5 ${muted ? 'opacity-70' : ''}`}>
      <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-[#d4fc18]/10 py-2 text-center">
        <span className="font-display text-[22px] leading-none text-[#d4fc18]">{d}</span>
        <span className="mt-1 text-[11px] font-semibold tracking-wider text-[#d4fc18]/80 uppercase">{SHORT[m - 1]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold break-words text-white">{event.title || 'Syomka'}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#a8a8ac]">
          <span className="inline-flex items-center gap-1.5">
            <SiteIcon name="clock" size={14} /> {formatDateKey(key, true)}, {formatTime(event.starts_at)}
            {event.ends_at && event.ends_at !== event.starts_at ? `–${formatTime(event.ends_at)}` : ''}
          </span>
          {event.location_name ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <SiteIcon name="pin" size={14} /> <span className="break-words">{event.location_name}</span>
            </span>
          ) : null}
        </p>
        {status.label ? <p className="mt-2 inline-flex rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#d9d9de]">{status.label}</p> : null}
      </div>
    </div>
  );
}

/** A planned post: when it goes out, what kind of content, on which platform. */
export function PostRow({ event }: { event: CabinetEvent }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[#d4fc18]">
        <SiteIcon name={event.content_type === 'reel' || event.content_type === 'video' ? 'film' : 'design'} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-white">{event.title || 'Post'}</p>
        <p className="text-[12px] text-[#8e8e96]">
          {[event.content_type ? lookup(CONTENT_TYPE, event.content_type, event.content_type) : null, event.platform ? lookup(PLATFORM_LABEL, event.platform, event.platform) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <span className="shrink-0 text-right text-[12.5px] text-[#a8a8ac]">
        {formatDateKey(agencyDateKey(new Date(event.starts_at)))}
        <br />
        {formatTime(event.starts_at)}
      </span>
    </li>
  );
}
