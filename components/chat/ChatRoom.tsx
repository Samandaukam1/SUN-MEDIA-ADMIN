'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Icon } from '@/components/ui/Icon';
import { deleteRoomMessage, editRoomMessage, markRoomRead, sendRoomMessage } from '@/lib/actions/chat';
import type { PanelMessage, RoomMember } from '@/lib/chat';
import { getBrowserClient } from '@/lib/supabase/client';

const TZ = 'Asia/Tashkent';
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const dayLabel = (key: string, today: string) => (key === today ? 'Bugun' : `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`);
const sizeLabel = (b: number | null) => (!b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

type Receipt = 'sent' | 'delivered' | 'read';

/** ✓ sent · ✓✓ delivered · ✓✓ (lime) read — only from what the server recorded for the other members. */
function receiptOf(m: PanelMessage, others: RoomMember[]): Receipt {
  if (m.reads.some((r) => r.user_id !== m.sender_id)) return 'read';
  if (others.some((o) => (o.deliveredAt && o.deliveredAt >= m.created_at) || (o.readAt && o.readAt >= m.created_at))) return 'delivered';
  return 'sent';
}

function Ticks({ state }: { state: Receipt }) {
  return (
    <span aria-label={state === 'read' ? 'O‘qildi' : state === 'delivered' ? 'Yetkazildi' : 'Yuborildi'} className={`inline-flex ${state === 'read' ? 'text-[#0a58ca]' : 'opacity-60'}`}>
      <svg viewBox="0 0 18 12" width={state === 'sent' ? 12 : 17} height={11} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 6.5 4.5 10 11 2" />
        {state !== 'sent' ? <path d="M7.5 9.2 8.4 10 15 2" /> : null}
      </svg>
    </span>
  );
}

/**
 * One chat in the panel: messages (oldest at the top), reply / edit / delete, delivery and read receipts with who
 * read it and when, a composer with attachments, live updates from the room's realtime signal. Everything shown
 * comes from the database through row-level security.
 */
export function ChatRoom({
  roomId,
  me,
  members,
  direct,
  messages,
  olderHref,
  readOnly,
  readOnlyReason,
  live,
  seeAllReceipts = false,
}: {
  roomId: string;
  me: string;
  members: RoomMember[];
  direct: boolean;
  /** The Rahbar / chat observers: who read every message in the room, not only their own. */
  seeAllReceipts?: boolean;
  messages: PanelMessage[];
  olderHref: string | null;
  readOnly: boolean;
  readOnlyReason?: string;
  live: boolean;
}) {
  const router = useRouter();
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<PanelMessage | null>(null);
  const [editing, setEditing] = useState<PanelMessage | null>(null);
  const [readersOf, setReadersOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastId = messages.at(-1)?.id;
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

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
    // This browser has the room's messages: delivered.
    const delivered = () => void supabase.rpc('mark_chat_delivered', { p_room_id: roomId }).then(() => undefined, () => undefined);
    delivered();
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`room:${roomId}`, { config: { private: true } })
        .on('broadcast', { event: 'message' }, () => {
          delivered();
          refresh();
        })
        .on('broadcast', { event: 'receipt' }, ({ payload }) => {
          if ((payload as { user_id?: string })?.user_id !== me) refresh();
        })
        .subscribe();
    });
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, live, router, me]);

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

  const cancelCompose = () => {
    if (editing) setText('');
    setReplyTo(null);
    setEditing(null);
  };

  const send = () =>
    start(async () => {
      setError(null);
      if (editing) {
        if (!text.trim()) return;
        const res = await editRoomMessage(editing.id, text);
        if (!res.ok) return setError(res.message);
        setEditing(null);
        setText('');
        router.refresh();
        return;
      }
      if (!text.trim() && !files.length) return;
      const ids = files.length ? await uploadAll() : [];
      setStatus(null);
      if (ids === null) return;
      const res = await sendRoomMessage(roomId, text, ids, replyTo?.id ?? null);
      if (!res.ok) return setError(res.message);
      setText('');
      setFiles([]);
      setReplyTo(null);
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    });

  const remove = (m: PanelMessage) => {
    if (!confirm('Xabar o‘chirilsinmi? Uning o‘rnida “Xabar o‘chirilgan” qoladi.')) return;
    start(async () => {
      const res = await deleteRoomMessage(m.id);
      if (!res.ok) setError(res.message);
      router.refresh();
    });
  };

  const startReply = (m: PanelMessage) => {
    setReplyTo(m);
    setEditing(null);
    textarea.current?.focus();
  };
  const startEdit = (m: PanelMessage) => {
    setEditing(m);
    setReplyTo(null);
    setText(m.body);
    textarea.current?.focus();
  };

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
          const recipients = members.filter((o) => o.id !== m.sender_id);
          const receipt = (mine || seeAllReceipts) && !m.deleted_at ? receiptOf(m, recipients) : null;
          const readers = m.reads.filter((r) => r.user_id !== m.sender_id).sort((a, b) => a.read_at.localeCompare(b.read_at));
          const unread = recipients.filter((o) => !readers.some((r) => r.user_id === o.id));
          const actions = !m.deleted_at && !readOnly;
          return (
            <div key={m.id}>
              {showDay ? <p className="my-3 text-center text-[11px] font-semibold tracking-wide text-subtle uppercase">{dayLabel(day, today)}</p> : null}
              {m.is_system ? (
                <p className="mx-auto max-w-md text-center text-[12.5px] text-muted">{m.body}</p>
              ) : (
                <div className={`group flex items-end gap-1 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`relative max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[70%] ${mine ? 'rounded-br-md bg-brand text-on-brand' : 'rounded-bl-md border border-line bg-surface'}`}>
                    {!mine ? <p className="mb-0.5 text-[12px] font-semibold text-muted">{m.sender_label || m.sender?.full_name || '—'}</p> : null}
                    {m.reply && !m.deleted_at ? (
                      <div className={`mb-1.5 rounded-lg border-l-2 px-2.5 py-1 text-[12.5px] ${mine ? 'border-current bg-black/10' : 'border-accent bg-surface-2'}`}>
                        <p className="font-semibold opacity-80">{m.reply.sender?.full_name ?? '—'}</p>
                        <p className="line-clamp-2 opacity-75">{m.reply.deleted_at ? 'Xabar o‘chirilgan' : m.reply.body || 'Fayl'}</p>
                      </div>
                    ) : null}
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
                    <p className={`mt-1 flex items-center justify-end gap-1 text-[10.5px] ${mine ? 'opacity-70' : 'text-subtle'}`}>
                      {m.edited_at && !m.deleted_at ? <span>tahrirlangan ·</span> : null}
                      {timeFmt.format(new Date(m.created_at))}
                      {receipt ? (
                        direct && mine ? (
                          <Ticks state={receipt} />
                        ) : (
                          <button type="button" onClick={() => setReadersOf(readersOf === m.id ? null : m.id)} aria-label="Kimlar o‘qidi" aria-expanded={readersOf === m.id} className="inline-flex">
                            <Ticks state={receipt} />
                          </button>
                        )
                      ) : null}
                    </p>
                    {readersOf === m.id ? (
                      <div className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-xl border border-line bg-surface p-3 text-left text-[12.5px] text-ink shadow-2xl">
                        <p className="mb-1 font-semibold">O‘qiganlar</p>
                        {readers.length ? (
                          <ul className="space-y-0.5">
                            {readers.map((r) => (
                              <li key={r.user_id} className="flex justify-between gap-2">
                                <span className="truncate">{nameOf.get(r.user_id) ?? '—'}</span>
                                <span className="shrink-0 text-muted">{timeFmt.format(new Date(r.read_at))}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted">Hali hech kim</p>
                        )}
                        {unread.length ? (
                          <>
                            <p className="mt-2 mb-1 font-semibold">O‘qimaganlar</p>
                            <p className="text-muted">{unread.map((u) => u.name).join(', ')}</p>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {actions ? (
                    <div className="mb-1 flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <button type="button" onClick={() => startReply(m)} aria-label="Javob berish" title="Javob berish" className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink">
                        <Icon name="rotateCcw" size={14} />
                      </button>
                      {mine ? (
                        <>
                          <button type="button" onClick={() => startEdit(m)} aria-label="Tahrirlash" title="Tahrirlash" className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink">
                            <Icon name="edit" size={14} />
                          </button>
                          <button type="button" onClick={() => remove(m)} aria-label="O‘chirish" title="O‘chirish" className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-danger-soft hover:text-danger">
                            <Icon name="x" size={14} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
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
          {replyTo || editing ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-accent bg-surface-2 px-3 py-2 text-[12.5px]">
              <Icon name={editing ? 'edit' : 'rotateCcw'} size={14} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{editing ? 'Tahrirlash' : `Javob: ${replyTo?.sender_id === me ? 'o‘zingizga' : (replyTo?.sender?.full_name ?? '—')}`}</span>
                <span className="block truncate text-muted">{(editing ?? replyTo)?.body || 'Fayl'}</span>
              </span>
              <button type="button" onClick={cancelCompose} aria-label="Bekor qilish" className="grid size-6 place-items-center rounded-full hover:bg-line">
                <Icon name="x" size={13} />
              </button>
            </div>
          ) : null}
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
            {!editing ? (
              <label htmlFor={`chat-files-${roomId}`} aria-label="Fayl biriktirish" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink">
                <Icon name="paperclip" size={18} />
              </label>
            ) : null}
            <textarea
              ref={textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
                if (e.key === 'Escape' && (editing || replyTo)) cancelCompose();
              }}
              rows={1}
              maxLength={4000}
              placeholder={editing ? 'Xabarni tahrirlang…' : 'Xabar yozing…'}
              title="Enter — yuborish, Shift+Enter — yangi qator"
              aria-label="Xabar"
              className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2 text-[14.5px] outline-none [field-sizing:content] placeholder:text-subtle focus:border-accent"
            />
            <button
              type="button"
              onClick={send}
              disabled={pending || (!text.trim() && !files.length)}
              aria-label={editing ? 'Saqlash' : 'Yuborish'}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-on-brand disabled:opacity-40"
            >
              {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name={editing ? 'check' : 'send'} size={17} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
