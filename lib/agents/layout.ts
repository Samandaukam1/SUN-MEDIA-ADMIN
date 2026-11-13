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

/** One line of the body copy: a plain paragraph or a list item with a design-drawn marker. */
export type BodyLine = { text: string; marker: 'none' | 'box' | 'dot' };

const BOX_MARKS = '□☐☑▢◻◽';
const DOT_MARKS = '•●▪■✓✔';
const MARK_SPLIT = new RegExp(`\\s*([${BOX_MARKS}${DOT_MARKS}])\\s*`);

/**
 * Body copy → lines. Items come one per line (the package prompt asks for that) or, from older output, inline after
 * ☐ / • symbols ("Tekshiring: □ a □ b"). Symbols are dropped: the composer draws the marker itself, so a list never
 * runs together into one paragraph. Lines without symbols become a list only when they look like one (2+ short
 * lines, an optional lead ending with ':'); otherwise they stay paragraphs.
 */
export function bodyLines(body: string): BodyLine[] {
  const out: BodyLine[] = [];
  const raw = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const anyMarks = raw.some((l) => MARK_SPLIT.test(l) || /^[-–—]\s+/.test(l));
  const plain = raw.filter((l, i) => !(i === 0 && l.endsWith(':')));
  const listy = !anyMarks && plain.length >= 2 && plain.every((l) => l.length <= 90);
  raw.forEach((line, i) => {
    const segs = line.split(MARK_SPLIT);
    const lead = segs[0].trim();
    if (lead) {
      const dash = /^[-–—]\s+/.test(lead);
      const isLead = i === 0 && lead.endsWith(':');
      out.push({ text: lead.replace(/^[-–—]\s+/, ''), marker: dash ? 'dot' : listy && !isLead ? 'dot' : 'none' });
    }
    for (let k = 1; k < segs.length; k += 2) {
      const text = (segs[k + 1] ?? '').trim();
      if (text) out.push({ text, marker: BOX_MARKS.includes(segs[k]) ? 'box' : 'dot' });
    }
  });
  return out;
}

/**
 * Inline symbols leave a closing sentence glued to the last item ("□ Veb-sayt Yo‘nalishlarni … ko‘rib chiqing.").
 * Split it off only when that is unambiguous: a short item, then a capitalised word not next to a conjunction, then a
 * sentence of 4+ words ending in . ! or ?
 */
function splitTail(item: string): [string, string | null] {
  const ws = item.split(' ');
  for (let k = 1; k <= Math.min(4, ws.length - 4); k++) {
    const conj = (w: string | undefined) => /^(va|yoki|hamda|bilan|ham|and|или|и)$/i.test((w ?? '').replace(/[,;]$/, ''));
    // "Instagram va Telegram …" is an enumeration of names, not the start of a new sentence.
    if (!/^\p{Lu}/u.test(ws[k]) || conj(ws[k - 1]) || conj(ws[k + 1])) continue;
    const tail = ws.slice(k).join(' ');
    if (/[.!?]$/.test(tail)) return [ws.slice(0, k).join(' '), tail];
  }
  return [item, null];
}

/** Lines grouped for layout: paragraphs, and runs of list items (short items flow in rows, long ones stack). */
export type BodyBlock = { kind: 'p'; text: string } | { kind: 'list'; inline: boolean; items: { text: string; marker: 'box' | 'dot' }[] };

export function bodyBlocks(lines: BodyLine[]): BodyBlock[] {
  const out: BodyBlock[] = [];
  const all = [...lines];
  const lastItem = all.map((l) => l.marker !== 'none').lastIndexOf(true);
  if (lastItem >= 0 && lastItem === all.length - 1 && all.filter((l) => l.marker !== 'none').length >= 3) {
    const [head, tail] = splitTail(all[lastItem].text);
    if (tail) all.splice(lastItem, 1, { ...all[lastItem], text: head }, { text: tail, marker: 'none' });
  }
  for (const l of all) {
    if (l.marker === 'none') {
      out.push({ kind: 'p', text: l.text });
      continue;
    }
    const last = out.at(-1);
    if (last?.kind === 'list') last.items.push({ text: l.text, marker: l.marker });
    else out.push({ kind: 'list', inline: false, items: [{ text: l.text, marker: l.marker }] });
  }
  for (const b of out) if (b.kind === 'list') b.inline = b.items.length >= 3 && b.items.every((i) => [...i.text].length <= 22);
  return out;
}

/** Marker column width, the gap between lines and between inline items — all relative to the font size. */
export const BODY_INDENT = 1.12;
export const BODY_GAP = 0.42;
export const BODY_ITEM_GAP = 0.9;

/** Short items packed into rows that fit the width (same estimate the fitting uses). */
export function packRows<T extends { text: string }>(items: T[], size: number, width: number): T[][] {
  const rows: T[][] = [];
  let used = 0;
  for (const it of items) {
    const w = size * BODY_INDENT + [...it.text].length * size * 0.53;
    if (rows.length && used + size * BODY_ITEM_GAP + w <= width) {
      rows.at(-1)!.push(it);
      used += size * BODY_ITEM_GAP + w;
    } else {
      rows.push([it]);
      used = w;
    }
  }
  return rows;
}

/** Largest body size at which every block fits the box (items narrower by the marker column). */
export function fitBody(blocks: BodyBlock[], box: { width: number; height: number }, max: number, min: number, lineHeight: number) {
  const measure = (size: number) => {
    let n = 0;
    let rows = 0;
    for (const b of blocks) {
      if (b.kind === 'p') {
        n += linesFor(b.text, size, box.width, 'body');
        rows++;
      } else if (b.inline) {
        const r = packRows(b.items, size, box.width).length;
        n += r;
        rows += r;
      } else
        for (const it of b.items) {
          n += linesFor(it.text, size, box.width - size * BODY_INDENT, 'body');
          rows++;
        }
    }
    return { n, height: n * size * lineHeight + Math.max(0, rows - 1) * size * BODY_GAP };
  };
  for (let size = max; size >= min; size -= 2) {
    const m = measure(size);
    if (m.height <= box.height) return { size, lines: m.n, height: m.height, overflow: false };
  }
  const m = measure(min);
  return { size: min, lines: m.n, height: m.height, overflow: true };
}

/**
 * Scrim opacity that keeps the text readable over the brightest (or, for dark text, darkest) patch behind it, not
 * just over the average colour — a light shape behind a few words is what made text unreadable.
 */
export function scrimAlpha(ink: Rgb, scrim: Rgb, worst: Rgb, base: number, max = 0.94): { alpha: number; ok: boolean } {
  let a = base;
  while (a < max && contrast(ink, mix(worst, scrim, a)) < 4.5) a = Math.min(max, a + 0.02);
  return { alpha: Math.round(a * 100) / 100, ok: contrast(ink, mix(worst, scrim, a)) >= 4.5 };
}
