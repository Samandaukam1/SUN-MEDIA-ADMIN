'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { addReportFile, removeReportFile } from '@/lib/actions/reports';
import { getBrowserClient } from '@/lib/supabase/client';

const ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
];
const MAX = 50 * 1024 * 1024;

type ReportFile = { id: string; name: string; size_bytes: number | null };

/** Files attached to a monthly report (PDF, pictures, Excel/Word/PowerPoint). The partner sees them once it is published. */
export function ReportFiles({ reportId, clientId, files }: { reportId: string; clientId: string; files: ReportFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [removing, startRemoving] = useTransition();

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMessage(null);
    const supabase = getBrowserClient();
    for (const file of Array.from(list).slice(0, 10)) {
      if (!ACCEPT.includes(file.type)) {
        setMessage({ text: `${file.name}: faqat PDF, rasm (JPG/PNG/WebP), Excel, Word, PowerPoint yoki CSV.`, error: true });
        continue;
      }
      if (file.size > MAX) {
        setMessage({ text: `${file.name}: 50 MB dan katta.`, error: true });
        continue;
      }
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100) || 'fayl';
      const path = `${clientId}/${reportId}/files/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from('reports').upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setMessage({ text: `${file.name}: yuklab bo‘lmadi.`, error: true });
        continue;
      }
      const res = await addReportFile(reportId, clientId, path, file.name);
      if (res.status === 'error') setMessage({ text: `${file.name}: ${res.message}`, error: true });
    }
    if (input.current) input.current.value = '';
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-muted">Fayllar (hamkorga hisobot bilan birga ko‘rinadi)</p>
      {files.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{f.name}</span>
              <Button
                type="button"
                variant="ghost"
                className="h-8 shrink-0 px-2 text-danger"
                disabled={removing}
                onClick={() =>
                  startRemoving(async () => {
                    const res = await removeReportFile(f.id, clientId);
                    setMessage(res.status === 'error' ? { text: res.message, error: true } : null);
                    router.refresh();
                  })
                }
              >
                Olib tashlash
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" multiple accept={ACCEPT.join(',')} className="sr-only" id={`report-files-${reportId}`} onChange={(e) => void upload(e.target.files)} />
        <label
          htmlFor={`report-files-${reportId}`}
          className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
          {busy ? 'Yuklanmoqda…' : 'Fayl biriktirish'}
        </label>
        <span className="text-[12.5px] text-subtle">PDF, rasm, Excel, Word, PowerPoint · 50 MB gacha · 20 tagacha</span>
      </div>
      {message ? <p className={`text-[13px] ${message.error ? 'text-danger' : 'text-success'}`}>{message.text}</p> : null}
    </div>
  );
}
