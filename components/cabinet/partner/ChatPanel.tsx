'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { MediaComposer } from '@/components/chat/media/MediaComposer';
import { RoundVideo, VoiceBubble } from '@/components/chat/media/MediaPlayers';
import { SiteIcon } from '@/components/site/SiteIcon';
import { markPartnerChatRead, sendPartnerMessage } from '@/lib/cabinet/partner-actions';
import type { ChatMessage } from '@/lib/cabinet/partner-data';
import { getBrowserClient } from '@/lib/supabase/client';

const TZ = 'Asia/Tashkent';
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

function dayLabel(key: string, today: string): string {
  if (key === today) return 'Bugun';
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function sizeLabel(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Messages (oldest at the top), a composer with attachments, and live updates: the room's realtime signal re-renders
 * the page, so what is shown always comes from the database through row-level security.
 */
export function ChatPanel({
  roomId,
  brand,
  me,
  messages,
  olderHref,
  readOnly,
  live,
}: {
  roomId: string;
  brand: string | null;
  me: string;
  messages: ChatMessage[];
  olderHref: string | null;
  readOnly: boolean;
  live: boolean;
}) {
  const router = useRouter();
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastId = messages.at(-1)?.id;

  // Keep the newest message in view and mark the room read whenever new messages arrive.
  useEffect(() => {
    if (!live) return;
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (!readOnly) void markPartnerChatRead(brand).catch(() => undefined);
  }, [lastId, live, readOnly, brand]);

  useEffect(() => {
    if (!live) return;
    const supabase = getBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase.channel(`room:${roomId}`, { config: { private: true } }).on('broadcast', { event: 'message' }, refresh).subscribe();
    });
    // A fallback in case the realtime connection drops.
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, live, router]);

  async function uploadAll(): Promise<string[] | null> {
    const supabase = getBrowserClient();
    const ids: string[] = [];
    for (const file of files) {
      setStatus(`Yuklanmoqda: ${file.name}`);
      const { data: row, error: createError } = await supabase.rpc('create_file_upload', {
        p_name: file.name,
        p_mime_type: file.type || 'application/octet-stream',
        p_size_bytes: file.size,
        p_chat_room_id: roomId,
      });
      if (createError || !row) {
        setError(createError?.code === '22023' ? `${file.name}: bu turdagi yoki hajmdagi fayl qabul qilinmaydi.` : `${file.name}: yuklab bo‘lmadi.`);
        return null;
      }
      const { error: uploadError } = await supabase.storage.from(row.bucket!).upload(row.storage_path!, file, { contentType: row.mime_type ?? undefined, upsert: false });
      if (uploadError) {
        setError(`${file.name}: serverga yetib bormadi.`);
        return null;
      }
      const { error: doneError } = await supabase.rpc('complete_file_upload', { p_file_id: row.id });
      if (doneError) {
        setError(`${file.name}: yuklash tasdiqlanmadi.`);
        return null;
      }
      ids.push(row.id);
    }
    return ids;
  }

  const send = () =>
    start(async () => {
      setError(null);
      if (!text.trim() && !files.length) return;
      const ids = files.length ? await uploadAll() : [];
      if (ids === null) {
        setStatus(null);
        return;
      }
      setStatus(null);
      const res = await sendPartnerMessage(brand, text, ids);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setText('');
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    });

  const today = dayFmt.format(new Date());
  let lastDay = '';

  return (
    <section className="lg flex h-[min(72dvh,760px)] flex-col overflow-hidden rounded-[28px]">
      <div ref={list} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-4 sm:px-6" data-lenis-prevent>
        {olderHref ? (
          <div className="flex justify-center pb-2">
            <Link href={olderHref} className="rounded-full bg-white/[0.06] px-4 py-1.5 text-[12.5px] text-[#d9d9de] hover:bg-white/[0.1]">
              Oldingi xabarlar
            </Link>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-white/[0.05] text-[#d4fc18]">
                <SiteIcon name="message" size={22} />
              </div>
              <p className="text-[15px] font-medium text-white">Hali xabar yo‘q</p>
              <p className="mt-1 text-[13.5px] text-[#8e8e96]">Savol, fikr yoki fayl yuboring — SUN MEDIA jamoasi javob beradi.</p>
            </div>
          </div>
        ) : null}
        {messages.map((m) => {
          const day = dayFmt.format(new Date(m.created_at));
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === me;
          const files = m.attachments.map((a) => a.file).filter((f): f is NonNullable<typeof f> => !!f);
          const media = !m.deleted_at && m.kind !== 'text' ? (files[0] ?? null) : null;
          const round = !!media && m.kind === 'round_video';
          return (
            <div key={m.id}>
              {showDay ? (
                <p className="my-3 text-center text-[11.5px] font-semibold tracking-wide text-[#6e6e76] uppercase">{dayLabel(day, today)}</p>
              ) : null}
              {m.is_system ? (
                <p className="mx-auto max-w-md text-center text-[12.5px] text-[#8e8e96]">{m.body}</p>
              ) : (
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] ${
                      round ? 'text-[#f4f4f5]' : `rounded-[20px] px-3.5 py-2.5 ${mine ? 'rounded-br-md bg-[#d4fc18] text-[#0b0b0c]' : 'rounded-bl-md bg-white/[0.07] text-[#f4f4f5]'}`
                    }`}
                  >
                    {!mine ? <p className="mb-0.5 text-[12px] font-semibold text-[#d4fc18]">{m.sender_label || m.sender?.full_name || 'SUN MEDIA'}</p> : null}
                    {m.deleted_at ? (
                      <p className={`text-[14px] italic ${mine ? 'text-[#0b0b0c]/60' : 'text-[#8e8e96]'}`}>Xabar o‘chirilgan</p>
                    ) : media && !round ? (
                      <VoiceBubble
                        src={`/kabinet/biriktirma/${media.id}?media=1`}
                        downloadHref={`/kabinet/biriktirma/${media.id}?yuklab=1`}
                        durationMs={media.duration_ms}
                        waveform={media.waveform}
                        seed={media.id}
                        knob={mine ? 'bg-[#0b0b0c] text-[#d4fc18]' : 'bg-[#d4fc18] text-[#0b0b0c]'}
                      />
                    ) : media ? (
                      <RoundVideo src={`/kabinet/biriktirma/${media.id}?media=1`} downloadHref={`/kabinet/biriktirma/${media.id}?yuklab=1`} durationMs={media.duration_ms} />
                    ) : (
                      <>
                        {m.body ? <p className="text-[14.5px] leading-snug whitespace-pre-wrap break-words">{m.body}</p> : null}
                        {files.length ? (
                          <div className="mt-2 space-y-1.5">
                            {files.map((f) =>
                              f.kind === 'image' ? (
                                <a key={f.id} href={`/kabinet/biriktirma/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/kabinet/biriktirma/${f.id}`} alt={f.name} className="max-h-64 w-auto rounded-xl object-cover" loading="lazy" />
                                </a>
                              ) : (
                                <a
                                  key={f.id}
                                  href={`/kabinet/biriktirma/${f.id}?yuklab=1`}
                                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] ${mine ? 'bg-black/10' : 'bg-white/[0.06]'}`}
                                >
                                  <SiteIcon name="file" size={15} className="shrink-0" />
                                  <span className="min-w-0 truncate">{f.name}</span>
                                  <span className="shrink-0 opacity-60">{sizeLabel(f.size_bytes)}</span>
                                </a>
                              ),
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                    <p
                      className={`mt-1 text-right text-[10.5px] ${round ? 'ml-auto w-fit rounded-full bg-white/[0.07] px-2 py-0.5 text-[#a8a8ac]' : mine ? 'text-[#0b0b0c]/55' : 'text-[#6e6e76]'}`}
                    >
                      {timeFmt.format(new Date(m.created_at))}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <p className="border-t border-white/[0.06] px-5 py-3 text-center text-[13px] text-[#8e8e96]">Ko‘rish rejimi: xabar yuborilmaydi.</p>
      ) : (
        <div className="cabinet-tokens border-t border-white/[0.06] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
          {files.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/[0.06] py-1 pr-1.5 pl-3 text-[12.5px] text-[#e4e4e7]">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`${f.name} — olib tashlash`} className="grid size-5 place-items-center rounded-full hover:bg-white/10">
                    <SiteIcon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {error || status ? <p className={`mb-2 text-[12.5px] ${error ? 'text-[#ff8a8a]' : 'text-[#a8a8ac]'}`}>{error ?? status}</p> : null}
          <div className="flex items-end gap-2">
            <MediaComposer
              roomId={roomId}
              replyTo={null}
              idle={!text.trim() && !files.length && !pending}
              onSent={() => router.refresh()}
              onError={setError}
              button="rounded-full bg-white/[0.06] text-[#d9d9de] hover:bg-white/[0.1] hover:text-white"
              primary="rounded-full bg-[#d4fc18] text-[#0b0b0c]"
              knob="bg-[#d4fc18] text-[#0b0b0c]"
              size="size-11"
              bar="min-h-11 rounded-[22px]"
              send={
                <button
                  type="button"
                  onClick={send}
                  disabled={pending || (!text.trim() && !files.length)}
                  aria-label="Yuborish"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c] transition-opacity disabled:opacity-40"
                >
                  {pending ? <span className="size-4 animate-spin rounded-full border-2 border-[#0b0b0c] border-t-transparent" /> : <SiteIcon name="send" size={18} />}
                </button>
              }
            >
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                id="chat-files"
                onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10))}
              />
              <label
                htmlFor="chat-files"
                aria-label="Fayl biriktirish"
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white/[0.06] text-[#d9d9de] hover:bg-white/[0.1] hover:text-white"
              >
                <SiteIcon name="plus" size={20} />
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Xabar yozing…"
                aria-label="Xabar"
                className="max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[14.5px] text-white outline-none [field-sizing:content] placeholder:text-[#5c5c64] focus:border-[#d4fc18]"
              />
            </MediaComposer>
          </div>
        </div>
      )}
    </section>
  );
}
