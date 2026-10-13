'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { SiteIcon } from '@/components/site/SiteIcon';
import { commentOnMyTask, moveMyTask, refreshMyTask } from '@/lib/cabinet/employee-actions';
import type { TaskAction } from '@/lib/cabinet/tasks';
import { getBrowserClient } from '@/lib/supabase/client';

export function TaskStatusButtons({ taskId, actions }: { taskId: string; actions: TaskAction[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!actions.length) return null;
  return (
    <div className="mt-6 border-t border-white/[0.06] pt-5">
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <button
            key={a.status}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setBusy(a.status);
                const res = await moveMyTask(taskId, a.status);
                setBusy(null);
                setError(res.ok ? null : res.message);
                if (res.ok) router.refresh();
              })
            }
            className={`s-btn h-11 px-5 text-[14px] disabled:opacity-60 ${i === 0 ? 's-btn-lime' : 's-btn-glass lg'}`}
          >
            {busy === a.status ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
            {a.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-[13px] text-[#ff8a8a]">{error}</p> : null}
    </div>
  );
}

export function TaskComment({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await commentOnMyTask(taskId, text);
          setError(res.ok ? null : res.message);
          if (res.ok) {
            setText('');
            router.refresh();
          }
        });
      }}
      className="space-y-3"
    >
      <label className="sr-only" htmlFor="task-comment">
        Izoh
      </label>
      <textarea
        id="task-comment"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
        rows={3}
        placeholder="Izoh yozing…"
        className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[14.5px] text-white outline-none placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.14)]"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-[#ff8a8a]">{error}</p>
        <button type="submit" disabled={pending || !text.trim()} className="s-btn s-btn-lime h-10 px-5 text-[14px] disabled:opacity-50">
          {pending ? 'Yuborilmoqda…' : 'Yuborish'}
        </button>
      </div>
    </form>
  );
}

const MESSAGES: Record<string, string> = {
  '42501': 'Bu vazifaga fayl biriktirishga ruxsatingiz yo‘q.',
  '22023': 'Fayl turi yoki hajmi qabul qilinmadi (50 MB gacha: rasm, video, audio, PDF, hujjat).',
};

/** Upload with this person's own session: the database registers the file, storage checks the path, then it is confirmed. */
export function TaskUpload({ taskId }: { taskId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = getBrowserClient();
    setState({ busy: true, message: null, error: false });
    let done = 0;
    for (const file of Array.from(files).slice(0, 10)) {
      setState({ busy: true, message: `Yuklanmoqda: ${file.name}`, error: false });
      const { data: row, error } = await supabase.rpc('create_file_upload', {
        p_name: file.name,
        p_mime_type: file.type || 'application/octet-stream',
        p_size_bytes: file.size,
        p_task_id: taskId,
      });
      if (error || !row) {
        setState({ busy: false, message: MESSAGES[error?.code ?? ''] ?? 'Faylni yuklab bo‘lmadi. Qayta urinib ko‘ring.', error: true });
        return;
      }
      const { error: storageError } = await supabase.storage.from(row.bucket!).upload(row.storage_path!, file, { contentType: row.mime_type ?? undefined, upsert: false });
      if (storageError) {
        setState({ busy: false, message: 'Fayl serverga yetib bormadi. Internetni tekshirib, qayta urinib ko‘ring.', error: true });
        return;
      }
      const { error: completeError } = await supabase.rpc('complete_file_upload', { p_file_id: row.id });
      if (completeError) {
        setState({ busy: false, message: 'Yuklash tasdiqlanmadi. Qayta urinib ko‘ring.', error: true });
        return;
      }
      done += 1;
    }
    if (input.current) input.current.value = '';
    await refreshMyTask(taskId);
    router.refresh();
    setState({ busy: false, message: `${done} ta fayl yuklandi.`, error: false });
  }

  return (
    <div>
      <input ref={input} type="file" multiple className="sr-only" id={`upload-${taskId}`} onChange={(e) => void upload(e.target.files)} disabled={state.busy} />
      <label
        htmlFor={`upload-${taskId}`}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center transition-colors hover:border-[#d4fc18]/60 hover:bg-white/[0.02] ${
          state.busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        {state.busy ? (
          <span className="size-5 animate-spin rounded-full border-2 border-[#d4fc18] border-t-transparent" />
        ) : (
          <SiteIcon name="upload" size={20} className="text-[#d4fc18]" />
        )}
        <span className="text-[14px] font-medium text-white">Material yuklash</span>
        <span className="text-[12px] text-[#8e8e96]">Rasm, video, audio, PDF yoki hujjat · 50 MB gacha</span>
      </label>
      {state.message ? <p className={`mt-3 text-[13px] ${state.error ? 'text-[#ff8a8a]' : 'text-[#d4fc18]'}`}>{state.message}</p> : null}
    </div>
  );
}
