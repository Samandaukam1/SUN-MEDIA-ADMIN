import 'server-only';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';
import sharp, { type OverlayOptions } from 'sharp';

import { DEFAULT_LAYOUT, uzText, type FrameLayout } from './core';
import { BODY_GAP, BODY_INDENT, BODY_ITEM_GAP, bodyBlocks, bodyLines, contrast, fit, fitBody, mix, packRows, readableOn, rgb, SAFE, scrimAlpha, SIZES, type Palette, type Rgb } from './layout';

/**
 * The Brand Composer. The AI picture is only the background; everything that must be exact is placed here,
 * deterministically, in this order: background (cropped to the exact canvas) → real product photo (with a real shadow,
 * never redrawn) → text layer (satori: headline, body, CTA, verified contact) → the ORIGINAL logo (resized only —
 * aspect ratio kept, pixels untouched). Output: an exact-size PNG master and a small JPEG for galleries.
 */

type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: 'normal' };
let builtin: Promise<FontSpec[]> | null = null;
function builtinFonts(): Promise<FontSpec[]> {
  builtin ??= Promise.all(
    (
      [
        ['Body', 'Inter-400.ttf', 400],
        ['Body', 'Inter-500.ttf', 500],
        ['Body', 'Inter-700.ttf', 700],
        ['Heading', 'Unbounded-600.ttf', 600],
        ['Heading', 'Unbounded-800.ttf', 800],
      ] as const
    ).map(async ([name, file, weight]) => {
      const buf = await readFile(join(process.cwd(), 'lib/agents/fonts', file));
      return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: 'normal' as const };
    }),
  );
  return builtin;
}

export type ComposeInput = {
  kind: 'story' | 'carousel';
  background: Buffer;
  layout?: Partial<FrameLayout>;
  label: string | null;
  headline: string;
  body: string;
  cta: string;
  contact: string | null;
  palette: Palette;
  logo: Buffer | null;
  product: Buffer | null;
  /** Brand fonts (TTF/OTF bytes) — the bundled Unbounded / Inter otherwise. */
  fonts?: { heading?: Buffer | null; body?: Buffer | null };
  safe?: { top: number; bottom: number; side: number };
};

export type Box = { x: number; y: number; w: number; h: number };
export type ComposeOutput = {
  png: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
  warnings: string[];
  logo: (Box & { origW: number; origH: number }) | null;
  product: (Box & { origW: number; origH: number; alpha: boolean }) | null;
  text: Box;
};

const lumOf = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Mean colour of a region of an image buffer (raw sRGB). */
export async function regionColor(img: Buffer, box: Box): Promise<Rgb> {
  const meta = await sharp(img).metadata();
  const left = Math.min(Math.max(0, Math.round(box.x)), (meta.width ?? 1) - 1);
  const topY = Math.min(Math.max(0, Math.round(box.y)), (meta.height ?? 1) - 1);
  const { channels } = await sharp(img)
    .extract({ left, top: topY, width: Math.max(1, Math.min(Math.round(box.w), (meta.width ?? 1) - left)), height: Math.max(1, Math.min(Math.round(box.h), (meta.height ?? 1) - topY)) })
    .removeAlpha()
    .stats();
  return [Math.round(channels[0].mean), Math.round(channels[1].mean), Math.round(channels[2].mean)];
}

async function toAb(b: Buffer | null | undefined): Promise<ArrayBuffer | null> {
  return b ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : null;
}

export async function compose(input: ComposeInput): Promise<ComposeOutput> {
  const { w: W, h: H } = SIZES[input.kind];
  const story = input.kind === 'story';
  const L: FrameLayout = { ...DEFAULT_LAYOUT, ...(input.layout ?? {}) };
  const S = input.safe ?? SAFE[input.kind];
  const pal = input.palette;
  const warnings = [...pal.warnings];

  // 1) Background: cover-crop to the exact canvas (attention keeps the subject), brightness from the layout.
  const bg = await sharp(input.background, { failOn: 'error' })
    .rotate()
    .resize(W, H, { fit: 'cover', position: sharp.strategy.attention })
    .modulate({ brightness: L.bgBrightness })
    .removeAlpha()
    .png()
    .toBuffer();

  // 2) Zones (inside Instagram-safe areas).
  const side = S.side;
  const inner = W - 2 * side;
  const logoBoxH = Math.round((story ? 120 : 104) * L.logoScale);
  const logoBoxW = Math.round((story ? 300 : 260) * L.logoScale);
  const top = S.top + (L.logoPos.startsWith('top') ? logoBoxH + 36 : 0);
  const bottom = H - S.bottom;
  const contactH = L.contactPos === 'hidden' || !input.contact ? 0 : 56;
  const ctaH = input.cta ? (story ? 104 : 92) : 0;
  // With a product photo the copy is tighter, so the product gets real room opposite it.
  const textAreaH = Math.round((bottom - top) * (input.product ? (story ? 0.42 : 0.46) : story ? 0.5 : 0.55));
  const textY = L.textPos === 'top' ? top : L.textPos === 'middle' ? Math.round(top + (bottom - top - textAreaH) / 2) : bottom - textAreaH - (L.contactPos === 'bottom' ? contactH : 0);
  const text: Box = { x: side, y: textY, w: inner, h: textAreaH };

  // 3) Legibility: text colour and scrim from what is actually behind the text.
  const behind = await regionColor(bg, text);
  let ink: Rgb = pal.text;
  if (contrast(ink, behind) < 4.5) {
    ink = readableOn(behind);
    if (contrast(pal.text, behind) >= 3) warnings.push('text_color_adjusted');
  }
  const darkInk = lumOf(ink) < 0.5;
  const scrimRgb: Rgb = darkInk ? mix(behind, [255, 255, 255], 0.55) : mix(behind, [0, 0, 0], 0.62);

  // 4) Copy, fitted to the box (sizes scale with the layout's headline scale).
  const headline = uzText(input.headline);
  const body = uzText(input.body);
  const cta = uzText(input.cta);
  const label = input.label ? uzText(input.label).toUpperCase().slice(0, 28) : '';
  const labelH = label ? 70 : 0;
  const headMax = Math.round((story ? 92 : 80) * L.headlineScale);
  const blocks = body ? bodyBlocks(bodyLines(body)) : [];
  const fitAt = (max: number) => {
    const h = fit(headline, { width: inner, height: (textAreaH - labelH - ctaH - 40) * (body ? 0.58 : 0.92) }, 'display', max, 36, 1.1);
    const b = blocks.length ? fitBody(blocks, { width: inner, height: textAreaH - labelH - ctaH - 70 - h.lines * h.size * 1.1 }, story ? 44 : 38, 26, 1.32) : { size: 0, lines: 0, height: 0, overflow: false };
    return { h, b };
  };
  // Headline and body are sized together: the headline gives way (not below 56px) before the body drops under 30px.
  let sized = fitAt(headMax);
  for (let max = headMax - 4; blocks.length && (sized.b.overflow || sized.b.size < 30) && max >= Math.min(headMax, 56); max -= 4) {
    const next = fitAt(max);
    if (next.b.size > sized.b.size || (sized.b.overflow && !next.b.overflow)) sized = next;
  }
  const head = sized.h;
  const bodyFit = sized.b;
  if (head.overflow || bodyFit.overflow) warnings.push('text_overflow');

  // 5) Scrim over where the copy actually sits, strong enough for the brightest patch behind it.
  const contentH = Math.min(textAreaH, Math.round(labelH + head.lines * head.size * 1.1 + (blocks.length ? 60 + bodyFit.height : 0) + (cta ? 34 + ctaH : 0)));
  const contentTop = L.textPos === 'top' ? textY : L.textPos === 'middle' ? Math.round(textY + (textAreaH - contentH) / 2) : textY + textAreaH - contentH;
  const contentBottom = contentTop + contentH;
  const region = await sharp(bg)
    .extract({ left: side, top: Math.max(0, contentTop), width: inner, height: Math.max(1, Math.min(H, contentBottom) - Math.max(0, contentTop)) })
    .stats();
  const spread = (k: number): Rgb => [0, 1, 2].map((c) => Math.max(0, Math.min(255, Math.round(region.channels[c].mean + k * region.channels[c].stdev)))) as Rgb;
  const scrim = scrimAlpha(ink, scrimRgb, darkInk ? spread(-1.8) : spread(1.8), L.textPos === 'middle' ? 0.78 : 0.82);
  if (!scrim.ok) warnings.push('busy_background');
  const pad = 40;
  const fade = story ? 260 : 220;
  const sTop = L.textPos === 'top' ? 0 : Math.max(0, contentTop - pad - fade);
  const sBottom = L.textPos === 'bottom' ? H : Math.min(H, contentBottom + pad + fade);
  const sH = Math.max(1, sBottom - sTop);
  const pct = (y: number) => `${Math.max(0, Math.min(100, Math.round(((y - sTop) / sH) * 1000) / 10))}%`;
  const A = rgb(scrimRgb, scrim.alpha);
  const Z = rgb(scrimRgb, 0);
  const scrimImage =
    L.textPos === 'top'
      ? `linear-gradient(to bottom, ${A} 0%, ${A} ${pct(contentBottom + pad)}, ${Z} 100%)`
      : L.textPos === 'bottom'
        ? `linear-gradient(to bottom, ${Z} 0%, ${A} ${pct(contentTop - pad)}, ${A} 100%)`
        : `linear-gradient(to bottom, ${Z} 0%, ${A} ${pct(contentTop - pad)}, ${A} ${pct(contentBottom + pad)}, ${Z} 100%)`;
  const marker = (m: 'box' | 'dot', size: number) =>
    m === 'box' ? (
      <div style={{ display: 'flex', width: Math.round(size * 0.62), height: Math.round(size * 0.62), marginTop: Math.round(size * 0.35), borderRadius: Math.round(size * 0.16), border: `${Math.max(3, Math.round(size * 0.09))}px solid ${rgb(pal.primary)}` }} />
    ) : (
      <div style={{ display: 'flex', width: Math.round(size * 0.36), height: Math.round(size * 0.36), marginTop: Math.round(size * 0.48), borderRadius: 999, backgroundColor: rgb(pal.primary) }} />
    );

  const fonts = await builtinFonts();
  const extra: FontSpec[] = [];
  const hf = await toAb(input.fonts?.heading);
  const bf = await toAb(input.fonts?.body);
  if (hf) extra.push({ name: 'BrandHeading', data: hf, weight: 700, style: 'normal' });
  if (bf) extra.push({ name: 'BrandBody', data: bf, weight: 400, style: 'normal' });
  const headFamily = hf ? 'BrandHeading' : 'Heading';
  const bodyFamily = bf ? 'BrandBody' : 'Body';

  const contactY = L.contactPos === 'top' ? S.top - 70 : bottom - contactH + 8;

  const overlay = (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', fontFamily: bodyFamily }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: sTop,
          width: W,
          height: sH,
          display: 'flex',
          backgroundImage: scrimImage,
        }}
      />
      <div style={{ position: 'absolute', left: side, top: textY, width: inner, height: textAreaH, display: 'flex', flexDirection: 'column', justifyContent: L.textPos === 'top' ? 'flex-start' : L.textPos === 'middle' ? 'center' : 'flex-end', color: rgb(ink) }}>
        {label ? (
          <div style={{ display: 'flex', alignSelf: 'flex-start', backgroundColor: rgb(pal.primary), color: rgb(pal.onPrimary), fontSize: 26, fontWeight: 700, letterSpacing: 1.5, padding: '10px 24px', borderRadius: 999, marginBottom: 28 }}>
            {label}
          </div>
        ) : null}
        <div style={{ display: 'flex', fontFamily: headFamily, fontWeight: hf ? 700 : 800, fontSize: head.size, lineHeight: 1.1, letterSpacing: -0.5 }}>{headline}</div>
        {blocks.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: bodyFit.size, lineHeight: 1.32, fontWeight: 500 }}>
            <div style={{ display: 'flex', width: 120, height: 8, borderRadius: 6, backgroundColor: rgb(pal.primary), marginTop: 26, marginBottom: 26 }} />
            {blocks
              .flatMap((b) =>
                b.kind === 'p'
                  ? [<div key="p" style={{ display: 'flex' }}>{b.text}</div>]
                  : b.inline
                    ? packRows(b.items, bodyFit.size, inner).map((row, r) => (
                        <div key={r} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                          {row.map((it, k) => (
                            <div key={k} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', marginLeft: k ? Math.round(bodyFit.size * BODY_ITEM_GAP) : 0 }}>
                              <div style={{ display: 'flex', width: Math.round(bodyFit.size * BODY_INDENT), flexShrink: 0 }}>{marker(it.marker, bodyFit.size)}</div>
                              <div style={{ display: 'flex' }}>{it.text}</div>
                            </div>
                          ))}
                        </div>
                      ))
                    : b.items.map((it, k) => (
                        <div key={k} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', width: Math.round(bodyFit.size * BODY_INDENT), flexShrink: 0 }}>{marker(it.marker, bodyFit.size)}</div>
                          <div style={{ display: 'flex', flex: 1 }}>{it.text}</div>
                        </div>
                      )),
              )
              .map((el, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', marginTop: i ? Math.round(bodyFit.size * BODY_GAP) : 0 }}>
                  {el}
                </div>
              ))}
          </div>
        ) : null}
        {cta ? (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              marginTop: 34,
              height: ctaH,
              maxWidth: inner,
              padding: '0 46px',
              borderRadius: 999,
              backgroundColor: rgb(pal.primary),
              color: rgb(pal.onPrimary),
              fontSize: cta.length > 26 ? 32 : 38,
              fontWeight: 700,
            }}
          >
            {cta}
          </div>
        ) : null}
      </div>
      {input.contact && L.contactPos !== 'hidden' ? (
        <div style={{ position: 'absolute', left: side, right: side, top: contactY, height: contactH, display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 600, color: rgb(mix(ink, scrimRgb, 0.15)) }}>{input.contact}</div>
      ) : null}
    </div>
  );
  const overlayPng = Buffer.from(await new ImageResponse(overlay, { width: W, height: H, fonts: [...fonts, ...extra] }).arrayBuffer());

  const layers: OverlayOptions[] = [];

  // 6) The real product photo, opposite the text.
  let productBox: ComposeOutput['product'] = null;
  if (input.product) {
    try {
      const meta = await sharp(input.product).metadata();
      const alpha = !!meta.hasAlpha;
      const free = L.textPos === 'bottom' ? { y0: top, y1: textY - 24 } : L.textPos === 'top' ? { y0: textY + textAreaH + 24, y1: bottom - contactH } : { y0: top, y1: textY - 24 };
      const room = free.y1 - free.y0;
      if (room < 220) warnings.push('product_no_room');
      const maxW = Math.round(W * (story ? 0.66 : 0.58) * L.productScale);
      const maxH = Math.max(120, Math.min(Math.round(H * (story ? 0.34 : 0.4) * L.productScale), room));
      const resized = await sharp(input.product).rotate().resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      const pw = resized.info.width;
      const ph = resized.info.height;
      if (pw < maxW * 0.45 && ph < maxH * 0.45) warnings.push('product_small_source');
      const py = Math.round(free.y0 + Math.max(0, (free.y1 - free.y0 - ph) / 2));
      const px = Math.round((W - pw) / 2);
      let piece = resized.data;
      if (!alpha) {
        // A photo with its own background: a clean card with rounded corners (never cut out by guesswork).
        const r = 28;
        const mask = Buffer.from(`<svg width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${r}" ry="${r}"/></svg>`);
        piece = await sharp(resized.data).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
      }
      // Soft shadow from the product's own silhouette.
      const alphaCh = await sharp(piece).ensureAlpha().extractChannel('alpha').linear(0.42, 0).png().toBuffer();
      const shadow = await sharp({ create: { width: pw, height: ph, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .joinChannel(alphaCh)
        .blur(16)
        .png()
        .toBuffer();
      layers.push({ input: shadow, left: px, top: Math.min(H - ph, py + 18) }, { input: piece, left: px, top: py });
      productBox = { x: px, y: py, w: pw, h: ph, origW: meta.width ?? pw, origH: meta.height ?? ph, alpha };
    } catch {
      warnings.push('product_image_unreadable');
    }
  }

  layers.push({ input: overlayPng, left: 0, top: 0 });

  // 7) The original logo: resized inside its box, aspect ratio kept, never altered otherwise.
  let logoBox: ComposeOutput['logo'] = null;
  if (input.logo) {
    try {
      const meta = await sharp(input.logo).metadata();
      const logo = await sharp(input.logo).resize({ width: logoBoxW, height: logoBoxH, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
      const lw = logo.info.width;
      const lh = logo.info.height;
      if (lw < logoBoxW * 0.4 && lh < logoBoxH * 0.4) warnings.push('logo_small_source');
      const lx = L.logoPos === 'top-right' || L.logoPos === 'bottom-right' ? W - side - lw : L.logoPos === 'top-center' ? Math.round((W - lw) / 2) : side;
      const ly = L.logoPos === 'bottom-right' ? bottom - lh - (contactH ? contactH + 12 : 0) : S.top;
      layers.push({ input: logo.data, left: lx, top: ly });
      logoBox = { x: lx, y: ly, w: lw, h: lh, origW: meta.width ?? lw, origH: meta.height ?? lh };
    } catch {
      warnings.push('logo_unreadable');
    }
  } else warnings.push('no_logo');

  const png = await sharp(bg).composite(layers).png({ compressionLevel: 8 }).toBuffer();
  const thumb = await sharp(png).resize({ width: 540 }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const meta = await sharp(png).metadata();
  return {
    png,
    thumb,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    sha256: createHash('sha256').update(png).digest('hex'),
    warnings: [...new Set(warnings)],
    logo: logoBox,
    product: productBox,
    text,
  };
}

/** Image facts for the quality check: exact size, sharpness estimate, dominant colours (quantised, with shares). */
export async function imageFacts(png: Buffer): Promise<{ width: number; height: number; sharpness: number; dominant: { rgb: Rgb; share: number }[] }> {
  const meta = await sharp(png).metadata();
  const st = await sharp(png).stats();
  const { data, info } = await sharp(png).resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  }
  const total = (data.length / info.channels) | 0;
  const dominant = [...buckets.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, 12)
    .map((c) => ({ rgb: [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)] as Rgb, share: c.n / total }));
  return { width: meta.width ?? 0, height: meta.height ?? 0, sharpness: st.sharpness, dominant };
}
