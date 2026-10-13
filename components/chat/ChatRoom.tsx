'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Icon } from '@/components/ui/Icon';
import { markRoomRead, sendRoomMessage } from '@/lib/actions/chat';
import type { ChatMessage } from '@/lib/cabinet/partner-data';
import { getBrowserClient } from '@/lib/supabase/client';

const TZ = 'Asia/Tashkent';
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const dayLabel = (key: string, today: string) => (key === today ? 'Bugun' : `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`);
const sizeLabel = (b: number | null) => (!b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * One chat in the panel: messages (oldest at the top), a composer with attachments, live updates from the room's
 * realtime signal. What is shown always comes from the database through row-level security.
 */
export function ChatRoom({
  roomId,
  me,
  messages,
  olderHref,
  readOnly,
  readOnlyReason,
  live,
}: {
  roomId: string;
  me: string;
  messages: ChatMessage[];
  olderHref: string | null;
  readOnly: boolean;
  readOnlyReason?: string;
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

  useEffect(() => {
    if (!live) return;
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (!readOnly) void markRoomRead(roomId).catch(() => undefined);
  }, [lastId, live, readOnly, roomId]);

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
      setStatus(null);
      if (ids === null) return;
      const res = await sendRoomMessage(roomId, text, ids);
      if (!res.ok) return setError(res.message);
      setText('');
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    });

  const today = dayFmt.format(new Date());
  let lastDay = '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={list} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-4 sm:px-5">
        {olderHref ? (
          <div className="flex justify-center pb-2">
            <Link href={olderHref} className="rounded-full bg-surface-2 px-4 py-1.5 text-[12.5px] text-muted hover:text-ink">
              Oldingi xabarlar
            </Link>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <Icon name="message" size={28} className="mx-auto mb-2 text-subtle" />
              <p className="font-medium">Hali xabar yo‘q</p>
              <p className="mt-1 text-[13px] text-muted">Birinchi bo‘lib yozing.</p>
            </div>
          </div>
        ) : null}
        {messages.map((m) => {
          const day = dayFmt.format(new Date(m.created_at));
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === me;
          const attached = m.attachments.map((a) => a.file).filter((f): f is NonNullable<typeof f> => !!f);
          return (
            <div key={m.id}>
              {showDay ? <p className="my-3 text-center text-[11px] font-semibold tracking-wide text-subtle uppercase">{dayLabel(day, today)}</p> : null}
              {m.is_system ? (
                <p className="mx-auto max-w-md text-center text-[12.5px] text-muted">{m.body}</p>
              ) : (
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[70%] ${mine ? 'rounded-br-md bg-brand text-on-brand' : 'rounded-bl-md border border-line bg-surface'}`}>
                    {!mine ? <p className="mb-0.5 text-[12px] font-semibold text-muted">{m.sender_label || m.sender?.full_name || '—'}</p> : null}
                    {m.deleted_at ? (
                      <p className="text-[14px] italic opacity-60">Xabar o‘chirilgan</p>
                    ) : (
                      <>
                        {m.body ? <p className="text-[14.5px] leading-snug break-words whitespace-pre-wrap">{m.body}</p> : null}
                        {attached.length ? (
                          <div className="mt-2 space-y-1.5">
                            {attached.map((f) =>
                              f.kind === 'image' ? (
                                <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/files/${f.id}`} alt={f.name} className="max-h-64 w-auto rounded-xl object-cover" loading="lazy" />
                                </a>
                              ) : (
                                <a key={f.id} href={`/api/files/${f.id}`} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] ${mine ? 'bg-black/10' : 'bg-surface-2'}`}>
                                  <Icon name="file" size={15} className="shrink-0" />
                                  <span className="min-w-0 truncate">{f.name}</span>
                                  <span className="shrink-0 opacity-60">{sizeLabel(f.size_bytes)}</span>
                                </a>
                              ),
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                    <p className={`mt-1 text-right text-[10.5px] ${mine ? 'opacity-60' : 'text-subtle'}`}>{timeFmt.format(new Date(m.created_at))}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <p className="border-t border-line px-5 py-3 text-center text-[13px] text-muted">{readOnlyReason ?? 'Bu chatni faqat kuzatasiz.'}</p>
      ) : (
        <div className="border-t border-line p-3">
          {files.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-1.5 pl-3 text-[12.5px]">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`${f.name} — olib tashlash`} className="grid size-5 place-items-center rounded-full hover:bg-line">
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {error || status ? <p className={`mb-2 text-[12.5px] ${error ? 'text-danger' : 'text-muted'}`}>{error ?? status}</p> : null}
          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" multiple className="sr-only" id={`chat-files-${roomId}`} onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
            <label htmlFor={`chat-files-${roomId}`} aria-label="Fayl biriktirish" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink">
              <Icon name="paperclip" size={18} />
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
              title="Enter — yuborish, Shift+Enter — yangi qator"
              aria-label="Xabar"
              className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2 text-[14.5px] outline-none [field-sizing:content] placeholder:text-subtle focus:border-accent"
            />
            <button
              type="button"
              onClick={send}
              disabled={pending || (!text.trim() && !files.length)}
              aria-label="Yuborish"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-on-brand disabled:opacity-40"
            >
              {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="send" size={17} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
