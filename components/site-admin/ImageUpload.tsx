'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { getBrowserClient } from '@/lib/supabase/client';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
/** The public "branding" bucket accepts files up to 2 MB. */
const MAX_BYTES = 2 * 1024 * 1024;
const BUCKET = 'branding';

async function encode(source: CanvasImageSource & { width: number; height: number }, side: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, side / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/**
 * SVG is never stored: it is drawn into a bitmap (scripts, links and external references inside an SVG do not
 * run when it is rendered as an image) and saved as WebP with its transparency. Storage refuses .svg under site/.
 */
async function rasterizeSvg(file: File, maxSide: number): Promise<HTMLCanvasElement> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('SVG faylni o‘qib bo‘lmadi.');
  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const w0 = parseFloat(svg.getAttribute('width') ?? '') || (box.length === 4 ? box[2] : 0) || 512;
  const h0 = parseFloat(svg.getAttribute('height') ?? '') || (box.length === 4 ? box[3] : 0) || 512;
  const k = maxSide / Math.max(w0, h0);
  const width = Math.round(w0 * k);
  const height = Math.round(h0 * k);
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w0} ${h0}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG faylni chizib bo‘lmadi.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Photos are scaled down and re-encoded as WebP in the browser (logos keep transparency), stepping the size
 * and quality down until they fit under 2 MB.
 */
async function prepare(file: File, maxSide: number): Promise<{ blob: Blob; ext: string; type: string }> {
  const source = file.type === 'image/svg+xml' ? await rasterizeSvg(file, Math.min(maxSide, 1600)) : await createImageBitmap(file);
  try {
    for (const [side, quality] of [[maxSide, 0.86], [maxSide, 0.78], [Math.round(maxSide * 0.75), 0.78], [Math.round(maxSide * 0.55), 0.72]] as const) {
      const blob = await encode(source, side, quality);
      if (blob && blob.size <= MAX_BYTES) return { blob, ext: 'webp', type: 'image/webp' };
    }
  } finally {
    if ('close' in source) source.close();
  }
  throw new Error('Rasmni 2 MB gacha siqib bo‘lmadi. Kichikroq rasm tanlang.');
}

/**
 * Uploads to branding/site/… with the admin's own session (storage policies check site.manage) and returns
 * the public URL the site shows.
 */
export async function uploadSiteImage(file: File, folder: string, maxSide = 2400): Promise<string> {
  if (!TYPES[file.type]) throw new Error('PNG, JPG, WEBP yoki SVG yuklang.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Fayl juda katta (40 MB gacha).');
  const { blob, ext, type } = await prepare(file, maxSide);
  const supabase = getBrowserClient();
  const path = `site/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error('Rasmni yuklab bo‘lmadi. Ruxsat yoki internetni tekshiring.');
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function ImageUpload({
  value,
  onChange,
  folder,
  label,
  hint,
  error,
  logo = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  label: string;
  hint?: string;
  error?: string;
  logo?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      onChange(await uploadSiteImage(file, folder, logo ? 1200 : 2400));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Yuklab bo‘lmadi.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-3">
        <div className={`relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line ${logo ? 'bg-white' : 'bg-surface-2'}`}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className={`size-full ${logo ? 'object-contain p-2' : 'object-cover'}`} />
          ) : (
            <Icon name="image" className="text-subtle" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button type="button" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
            {value ? 'Almashtirish' : 'Yuklash'}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
              Olib tashlash
            </Button>
          ) : null}
        </div>
      </div>
      {problem || error ? <p className="text-[13px] text-danger">{problem ?? error}</p> : hint ? <p className="text-[13px] text-subtle">{hint}</p> : null}
    </div>
  );
}

export function GalleryUpload({
  value,
  onChange,
  folder,
  label,
  max,
  error,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  label: string;
  max: number;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);
    const next = [...value];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) next.push(await uploadSiteImage(file, folder, 2000));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Yuklab bo‘lmadi.');
    } finally {
      onChange(next);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted">
        {label} <span className="text-subtle">· {value.length}/{max}</span>
      </span>
      <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-surface p-3">
        {value.map((url, i) => (
          <div key={url} className="group relative size-24 overflow-hidden rounded-lg border border-line bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-full object-cover" />
            <span className="absolute top-1 left-1 rounded-md bg-black/60 px-1.5 text-[11px] font-semibold text-white tabular">{i + 1}</span>
            <button
              type="button"
              aria-label="Olib tashlash"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              <Icon name="x" size={13} />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                aria-label="Chapga surish"
                disabled={i === 0}
                onClick={() => {
                  const next = [...value];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  onChange(next);
                }}
                className="grid size-6 place-items-center rounded-full bg-black/70 text-white disabled:opacity-30"
              >
                <Icon name="chevronLeft" size={13} />
              </button>
              <button
                type="button"
                aria-label="O‘ngga surish"
                disabled={i === value.length - 1}
                onClick={() => {
                  const next = [...value];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  onChange(next);
                }}
                className="grid size-6 place-items-center rounded-full bg-black/70 text-white disabled:opacity-30"
              >
                <Icon name="chevronRight" size={13} />
              </button>
            </div>
          </div>
        ))}
        {value.length < max ? (
          <>
            <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files)} />
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="grid size-24 place-items-center rounded-lg border border-dashed border-line-strong text-muted hover:text-ink disabled:opacity-60"
            >
              {busy ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="plus" />}
            </button>
          </>
        ) : null}
      </div>
      {problem || error ? <p className="text-[13px] text-danger">{problem ?? error}</p> : null}
    </div>
  );
}
