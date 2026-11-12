import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';
import sharp from 'sharp';

import { fit, mix, palette, rgb, SIZES, type Rgb } from './layout';

/**
 * Tayyor rasm: dizayn shabloni (satori, next/og) → PNG → JPEG (Instagram faqat JPEG qabul qiladi).
 * Matn, logotip va aloqa ma'lumoti dizayn qatlamida aniq joylashtiriladi — AI rasmiga ishonib topshirilmaydi.
 * Story 1080×1920 (9:16), post 1080×1350 (4:5 — Instagram chegarasi ichida).
 */

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: 'normal' };
let fontsPromise: Promise<Font[]> | null = null;
function fonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all(
    (
      [
        ['Inter', 'Inter-400.ttf', 400],
        ['Inter', 'Inter-500.ttf', 500],
        ['Inter', 'Inter-700.ttf', 700],
        ['Unbounded', 'Unbounded-600.ttf', 600],
        ['Unbounded', 'Unbounded-800.ttf', 800],
      ] as const
    ).map(async ([name, file, weight]) => {
      const buf = await readFile(join(process.cwd(), 'lib/agents/fonts', file));
      return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: 'normal' as const };
    }),
  );
  return fontsPromise;
}

export type RenderInput = {
  kind: 'story' | 'post';
  template: string;
  label: string | null;
  headline: string;
  body: string;
  cta: string;
  colors: Record<string, unknown> | null;
  brand: { name: string; phone: string | null; telegram: string | null; instagram: string | null };
  logo: Buffer | null;
  photo: Buffer | null;
  counter: string | null;
};

async function dataUri(buf: Buffer, opts: { maxW: number; maxH: number; format: 'png' | 'jpeg' }): Promise<{ uri: string; w: number; h: number } | null> {
  try {
    const img = sharp(buf, { failOn: 'error' }).rotate().resize({ width: opts.maxW, height: opts.maxH, fit: 'inside', withoutEnlargement: true });
    const out = opts.format === 'png' ? await img.png().toBuffer({ resolveWithObject: true }) : await img.jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { uri: `data:image/${opts.format};base64,${out.data.toString('base64')}`, w: out.info.width, h: out.info.height };
  } catch {
    return null;
  }
}

const LABELS: Record<string, string> = { tip: 'FOYDALI', qa: 'SAVOL-JAVOB', product: 'MAHSULOT', offer: 'TAKLIF', process: 'JARAYON', bold: '' };

export async function renderFrame(input: RenderInput): Promise<{ jpeg: Buffer; warnings: string[] }> {
  const { w: W, h: H } = SIZES[input.kind];
  const story = input.kind === 'story';
  const pal = palette(input.colors);
  const warnings = [...pal.warnings];
  const M = 80;
  const top = story ? 210 : 70;
  const bottom = story ? 250 : 80;
  const inner = W - 2 * M;

  const [logo, photo] = await Promise.all([
    input.logo ? dataUri(input.logo, { maxW: 300, maxH: 120, format: 'png' }) : Promise.resolve(null),
    input.photo ? dataUri(input.photo, { maxW: 1400, maxH: 1400, format: 'jpeg' }) : Promise.resolve(null),
  ]);
  if (input.logo && !logo) warnings.push('logo_unreadable');
  if (!input.logo) warnings.push('no_logo');
  if (input.photo && !photo) warnings.push('product_image_unreadable');

  const template = photo ? 'product' : input.template === 'product' ? 'tip' : input.template;
  const photoH = photo ? Math.round(H * (story ? 0.46 : 0.48)) : 0;
  const label = (input.label ?? LABELS[template] ?? '').toUpperCase().slice(0, 28);
  const contact = [input.brand.phone, input.brand.telegram ? `@${input.brand.telegram.replace(/^@/, '')}` : input.brand.instagram ? `@${input.brand.instagram}` : null].filter(Boolean).join('  ·  ');

  // Matn maydoni: yuqori (logo + rasm) va pastki (CTA + aloqa) bloklardan qolgani.
  const headerH = 120;
  const ctaH = input.cta ? 112 : 0;
  const footerH = contact || input.counter ? 60 : 0;
  const textTop = Math.max(top + headerH, photoH ? photoH - 40 : 0);
  const textH = H - bottom - footerH - ctaH - (input.cta ? 40 : 0) - textTop - (label ? 90 : 0);
  const bold = template === 'bold' || template === 'qa';
  const head = fit(input.headline, { width: inner, height: textH * (input.body ? 0.58 : 0.9) }, 'display', bold ? (story ? 104 : 92) : story ? 84 : 74, 42, 1.12);
  const bodyBox = { width: inner, height: textH - head.lines * head.size * 1.12 - 60 };
  const body = input.body ? fit(input.body, bodyBox, 'body', story ? 46 : 40, 28, 1.34) : { size: 0, lines: 0, overflow: false };
  if (head.overflow || body.overflow) warnings.push('text_overflow');

  const bgDeep: Rgb = mix(pal.bg, [0, 0, 0], 0.18);
  const glowA = rgb(pal.primary, 0.42);
  const glowB = rgb(pal.secondary, 0.55);
  const font = await fonts();

  const el = (
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: rgb(pal.bg),
        backgroundImage: `radial-gradient(circle at 92% 6%, ${glowA} 0%, rgba(0,0,0,0) 46%), radial-gradient(circle at 0% 100%, ${glowB} 0%, rgba(0,0,0,0) 52%), linear-gradient(180deg, ${rgb(pal.bg)} 0%, ${rgb(bgDeep)} 100%)`,
        fontFamily: 'Inter',
        color: rgb(pal.text),
      }}
    >
      {photo ? (
        <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: photoH, display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.uri} width={W} height={photoH} style={{ width: W, height: photoH, objectFit: 'cover' }} alt="" />
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: Math.round(photoH * 0.55), display: 'flex', backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${rgb(pal.bg)} 100%)` }} />
        </div>
      ) : null}

      {/* Logo yoki brend nomi */}
      <div style={{ position: 'absolute', top: story ? top - 120 : 52, left: M, right: M, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.uri} width={logo.w} height={logo.h} style={{ maxHeight: 110, objectFit: 'contain' }} alt="" />
        ) : (
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 2, color: rgb(photo ? [255, 255, 255] : pal.muted) }}>{input.brand.name.toUpperCase().slice(0, 32)}</div>
        )}
      </div>

      <div style={{ position: 'absolute', top: textTop, left: M, width: inner, display: 'flex', flexDirection: 'column' }}>
        {label ? (
          <div style={{ display: 'flex', alignSelf: 'flex-start', backgroundColor: rgb(pal.primary), color: rgb(pal.onPrimary), fontSize: 28, fontWeight: 700, letterSpacing: 1.5, padding: '12px 26px', borderRadius: 999, marginBottom: 42 }}>
            {label}
          </div>
        ) : null}
        {template === 'qa' ? <div style={{ display: 'flex', fontFamily: 'Unbounded', fontWeight: 800, fontSize: 150, lineHeight: 1, color: rgb(pal.primary), marginBottom: 10 }}>?</div> : null}
        <div style={{ display: 'flex', fontFamily: 'Unbounded', fontWeight: bold ? 800 : 600, fontSize: head.size, lineHeight: 1.12, letterSpacing: -0.5 }}>{input.headline}</div>
        <div style={{ display: 'flex', width: 140, height: 10, borderRadius: 6, backgroundColor: rgb(pal.primary), marginTop: 34, marginBottom: 34 }} />
        {input.body ? <div style={{ display: 'flex', fontSize: body.size, lineHeight: 1.34, fontWeight: 500, color: rgb(mix(pal.text, pal.bg, 0.1)) }}>{input.body}</div> : null}
      </div>

      {input.cta ? (
        <div
          style={{
            position: 'absolute',
            left: M,
            bottom: bottom + footerH + 24,
            display: 'flex',
            alignItems: 'center',
            maxWidth: inner,
            height: ctaH,
            padding: '0 52px',
            borderRadius: 999,
            backgroundColor: rgb(pal.primary),
            color: rgb(pal.onPrimary),
            fontSize: input.cta.length > 26 ? 34 : 40,
            fontWeight: 700,
          }}
        >
          {input.cta}
        </div>
      ) : null}

      {contact || input.counter ? (
        <div style={{ position: 'absolute', left: M, right: M, bottom, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 30, color: rgb(pal.muted) }}>
          <div style={{ display: 'flex' }}>{contact}</div>
          <div style={{ display: 'flex', fontWeight: 700 }}>{input.counter ?? ''}</div>
        </div>
      ) : null}
    </div>
  );

  const png = Buffer.from(await new ImageResponse(el, { width: W, height: H, fonts: font }).arrayBuffer());
  const jpeg = await sharp(png).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  return { jpeg, warnings: [...new Set(warnings)] };
}
