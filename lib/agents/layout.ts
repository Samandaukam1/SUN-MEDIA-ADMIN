/**
 * Rasm shablonlari uchun sof hisob-kitob: ranglar, kontrast, matnni qutiga sig'dirish (shrift o'lchamini tanlash).
 * Satori matnni o'zi qatorlarga bo'ladi; bu yerda o'rtacha harf kengligi bo'yicha eng katta sig'adigan o'lcham tanlanadi.
 * Eng kichik o'lchamda ham sig'masa — "text_overflow" (sifat tekshiruvi materialni to'xtatadi).
 */
export const SIZES = { story: { w: 1080, h: 1920 }, carousel: { w: 1080, h: 1350 }, post: { w: 1080, h: 1350 } } as const;

/** Instagram-safe zones: the Story's top bar and reply field cover these bands; essentials stay inside. */
export const SAFE = { story: { top: 250, bottom: 340, side: 64 }, carousel: { top: 70, bottom: 80, side: 72 }, post: { top: 70, bottom: 80, side: 72 } } as const;

export type Rgb = [number, number, number];

export function hexToRgb(hex: string | null | undefined, fallback: Rgb): Rgb {
  const h = (hex ?? '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return fallback;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgb = (c: Rgb, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as Rgb;

function lum([r, g, b]: Rgb) {
  const ch = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
export function contrast(a: Rgb, b: Rgb) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export const readableOn = (bg: Rgb): Rgb => (contrast(bg, [255, 255, 255]) >= contrast(bg, [17, 24, 39]) ? [255, 255, 255] : [17, 24, 39]);

export type Palette = { bg: Rgb; primary: Rgb; secondary: Rgb; text: Rgb; muted: Rgb; onPrimary: Rgb; warnings: string[] };

export function palette(colors: Record<string, unknown> | null | undefined): Palette {
  const c = (colors ?? {}) as Record<string, string>;
  const bg = hexToRgb(c.bg, [11, 18, 32]);
  const primary = hexToRgb(c.primary, [212, 252, 24]);
  const secondary = hexToRgb(c.secondary, mix(bg, primary, 0.25));
  let text = hexToRgb(c.text, readableOn(bg));
  const warnings: string[] = [];
  if (contrast(bg, text) < 4) {
    text = readableOn(bg);
    if (c.text) warnings.push('low_contrast_fixed');
  }
  return { bg, primary, secondary, text, muted: mix(text, bg, 0.38), onPrimary: readableOn(primary), warnings };
}

/** O'rtacha harf kengligi (o'lchamga nisbatan): Unbounded keng, Inter tor. */
const WIDTH: Record<'display' | 'body', number> = { display: 0.74, body: 0.53 };

export function linesFor(text: string, size: number, boxWidth: number, family: 'display' | 'body'): number {
  const perLine = Math.max(1, Math.floor(boxWidth / (size * WIDTH[family])));
  let lines = 0;
  for (const para of text.split('\n')) {
    const ws = para.split(/\s+/).filter(Boolean);
    if (!ws.length) {
      lines++;
      continue;
    }
    let cur = 0;
    let n = 1;
    for (const w of ws) {
      const len = [...w].length;
      if (len > perLine) {
        n += Math.ceil(len / perLine) - (cur ? 0 : 1);
        cur = len % perLine;
        continue;
      }
      if (cur === 0) cur = len;
      else if (cur + 1 + len <= perLine) cur += 1 + len;
      else {
        n++;
        cur = len;
      }
    }
    lines += n;
  }
  return lines;
}

export function fit(text: string, box: { width: number; height: number }, family: 'display' | 'body', max: number, min: number, lineHeight: number) {
  for (let size = max; size >= min; size -= 2) {
    const lines = linesFor(text, size, box.width, family);
    if (lines * size * lineHeight <= box.height) return { size, lines, overflow: false };
  }
  return { size: min, lines: linesFor(text, min, box.width, family), overflow: true };
}
