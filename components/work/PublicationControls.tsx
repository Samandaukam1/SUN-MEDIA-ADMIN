'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { confirmPublication, schedulePost } from '@/lib/actions/workflow';
import { PLATFORM_NAME, PLATFORM_OPTIONS, PUBLICATION_LABEL } from '@/lib/workflow-shared';

export type Publication = { platform: string; scheduledAt: string | null; publishedAt: string | null; status: string; url: string | null };

const TZ = 'Asia/Tashkent';
const when = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const timeKey = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * The post stage: where and when it goes out, the published links. Posts are published by hand (no real platform
 * integration), so the person responsible confirms each platform with its link; a manager may also move the time.
 */
export function PublicationControls({
  contentId,
  publications,
  postAt,
  canSchedule,
  canConfirm,
  tone = 'panel',
}: {
  contentId: string;
  publications: Publication[];
  postAt: string | null;
  canSchedule: boolean;
  canConfirm: boolean;
  tone?: 'panel' | 'dark';
}) {
  const router = useRouter();
  const dark = tone === 'dark';
  const live = publications.filter((p) => p.status !== 'cancelled');
  const open = live.filter((p) => p.status !== 'published');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState(postAt ? dateKey.format(new Date(postAt)) : '');
  const [time, setTime] = useState(postAt ? timeKey.format(new Date(postAt)) : '19:00');
  const [platforms, setPlatforms] = useState<string[]>(live.length ? live.map((p) => p.platform) : ['instagram']);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const field = dark
    ? 'h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-[14px] text-white outline-none placeholder:text-[#5c5c64] focus:border-[#d4fc18]'
    : 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent';
  const primary = dark ? 's-btn s-btn-lime h-11 px-5 text-[14px] disabled:opacity-50' : 'h-10 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50';
  const secondary = dark ? 's-btn s-btn-glass lg h-11 px-5 text-[14px]' : 'h-10 rounded-xl border border-line-strong px-4 text-sm font-medium';
  const muted = dark ? 'text-[#8e8e96]' : 'text-muted';

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: done } : { ok: false, text: res.message ?? 'Xatolik.' });
      if (res.ok) {
        setLinks({});
        setScheduling(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      {live.length ? (
        <ul className="space-y-1.5">
          {live.map((p) => (
            <li key={p.platform} className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] ${dark ? 'text-[#e4e4e7]' : ''}`}>
              <span className="font-semibold">{PLATFORM_NAME[p.platform] ?? p.platform}</span>
              <span className={muted}>{p.status === 'published' && p.publishedAt ? `joylandi ${when.format(new Date(p.publishedAt))}` : p.scheduledAt ? when.format(new Date(p.scheduledAt)) : 'vaqt belgilanmagan'}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${p.status === 'published' ? 'bg-emerald-400/15 text-emerald-500' : dark ? 'bg-white/[0.06] text-[#d9d9de]' : 'bg-surface-2 text-muted'}`}>
                {PUBLICATION_LABEL[p.status] ?? p.status}
              </span>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" className={`truncate underline underline-offset-2 ${dark ? 'text-[#d4fc18]' : ''}`}>
                  {p.url.replace(/^https?:\/\//, '').slice(0, 48)}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-[13.5px] ${muted}`}>Platforma va vaqt hali belgilanmagan.</p>
      )}

      {canConfirm && open.length ? (
        <div className={`space-y-2 rounded-2xl p-3 ${dark ? 'bg-white/[0.03]' : 'bg-surface-2'}`}>
          <p className={`text-[13px] font-medium ${dark ? 'text-white' : ''}`}>Postni joylagach, havolasini qo‘ying:</p>
          {open.map((p) => (
            <label key={p.platform} className={`block text-[12.5px] ${muted}`}>
              {PLATFORM_NAME[p.platform] ?? p.platform} havolasi
              <input
                value={links[p.platform] ?? ''}
                onChange={(e) => setLinks({ ...links, [p.platform]: e.target.value })}
                inputMode="url"
                placeholder="https://"
                className={`${field} mt-1`}
              />
            </label>
          ))}
          <button type="button" disabled={pending || !Object.values(links).some((v) => v.trim())} onClick={() => run(() => confirmPublication(contentId, links), 'Post joylangani tasdiqlandi.')} className={primary}>
            Post joylandi — tasdiqlash
          </button>
        </div>
      ) : null}

      {canSchedule ? (
        scheduling ? (
          <div className={`space-y-2 rounded-2xl p-3 ${dark ? 'bg-white/[0.03]' : 'bg-surface-2'}`}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Post sanasi" className={field} />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Post vaqti" className={field} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_OPTIONS.map((p) => {
                const on = platforms.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p.key) : [...platforms, p.key])}
                    className={`h-8 rounded-lg border px-3 text-[12.5px] ${on ? (dark ? 'border-[#d4fc18] text-[#d4fc18]' : 'border-accent bg-accent-soft text-accent-on-soft') : dark ? 'border-white/10 text-[#a8a8ac]' : 'border-line text-muted'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={pending || !date || !platforms.length} onClick={() => run(() => schedulePost(contentId, date, time, platforms), 'Post vaqti saqlandi, mas’ulga xabar ketdi.')} className={primary}>
                Saqlash
              </button>
              <button type="button" onClick={() => setScheduling(false)} className={secondary}>
                Bekor
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setScheduling(true)} className={secondary}>
            {postAt ? 'Post vaqtini o‘zgartirish' : 'Post vaqtini belgilash'}
          </button>
        )
      ) : null}
      {msg ? <p className={`text-[13px] ${msg.ok ? 'text-emerald-500' : 'text-[#ff8a8a]'}`}>{msg.text}</p> : null}
    </div>
  );
}
