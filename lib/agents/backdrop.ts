import 'server-only';

import sharp from 'sharp';

/**
 * Backgrounds made without the image API ($0): a brand composition from the client's own colours, or a softened,
 * re-framed variant of the post's AI picture for the middle slides of a carousel. Both are 1024×1536 PNGs — the same
 * size an AI background has — so the composer (text, real product photo, original logo) treats them identically.
 * Deterministic: the same colours and variant give the same bytes.
 */

const W = 1024;
const H = 1536;
type Rgb = [number, number, number];

const hex = (v: unknown, d: Rgb): Rgb => {
  const m = typeof v === 'string' ? /^#?([0-9a-f]{6})$/i.exec(v.trim()) : null;
  if (!m) return d;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const css = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as Rgb;
const lum = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Fine film grain (seeded), so flat brand colours look printed rather than empty. */
function grain(seed: number, strength: number): Buffer {
  let s = seed >>> 0 || 1;
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const v = (s >>> 0) & 255;
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = Math.round(strength * 255);
  }
  return px;
}

export async function brandBackdrop(a: { colors: Record<string, unknown> | null | undefined; variant: number; seed?: number }): Promise<Buffer> {
  const c = a.colors ?? {};
  const bg = hex(c.bg ?? c.background, [12, 12, 14]);
  const primary = hex(c.primary, [212, 252, 24]);
  const secondary = hex(c.secondary, mix(bg, primary, 0.35));
  const dark = lum(bg) < 0.5;
  // The base is the brand background, a touch deeper at the bottom; glows are the brand colours, kept soft so text and
  // the product stay the heroes.
  const top = mix(bg, dark ? [255, 255, 255] : [0, 0, 0], dark ? 0.05 : 0.03);
  const bottom = mix(bg, dark ? [0, 0, 0] : [255, 255, 255], dark ? 0.35 : 0.2);
  const v = ((a.variant % 4) + 4) % 4;
  const glow = (id: string, color: Rgb, o: number) =>
    `<radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${css(color)}" stop-opacity="${o}"/><stop offset="0.55" stop-color="${css(color)}" stop-opacity="${(o * 0.35).toFixed(3)}"/><stop offset="1" stop-color="${css(color)}" stop-opacity="0"/></radialGradient>`;
  const p = dark ? 0.55 : 0.34;
  const shapes = [
    // 0 — corner glow: primary light top-right, secondary bottom-left.
    `<ellipse cx="${W * 0.92}" cy="${H * 0.1}" rx="${W * 0.75}" ry="${W * 0.75}" fill="url(#g1)"/><ellipse cx="${W * 0.05}" cy="${H * 0.95}" rx="${W * 0.7}" ry="${W * 0.6}" fill="url(#g2)"/>`,
    // 1 — diagonal light band across the frame.
    `<g transform="rotate(-32 ${W / 2} ${H / 2})"><rect x="${-W}" y="${H * 0.46}" width="${W * 3}" height="${H * 0.16}" fill="url(#band)"/></g><ellipse cx="${W * 0.85}" cy="${H * 0.85}" rx="${W * 0.6}" ry="${W * 0.6}" fill="url(#g2)"/>`,
    // 2 — thin concentric rings in a corner, with a glow at their centre.
    `<ellipse cx="${W * 0.95}" cy="${H * 0.08}" rx="${W * 0.55}" ry="${W * 0.55}" fill="url(#g1)"/>${[0.28, 0.42, 0.56, 0.7, 0.84]
      .map((r, i) => `<circle cx="${W * 0.95}" cy="${H * 0.08}" r="${W * r}" fill="none" stroke="${css(primary)}" stroke-opacity="${(0.16 - i * 0.025).toFixed(3)}" stroke-width="2"/>`)
      .join('')}`,
    // 3 — aurora: two large soft fields of the brand colours.
    `<ellipse cx="${W * 0.25}" cy="${H * 0.18}" rx="${W * 0.9}" ry="${H * 0.28}" fill="url(#g1)"/><ellipse cx="${W * 0.8}" cy="${H * 0.62}" rx="${W * 0.85}" ry="${H * 0.3}" fill="url(#g2)"/>`,
  ][v];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${css(top)}"/><stop offset="1" stop-color="${css(bottom)}"/></linearGradient>
${glow('g1', primary, p)}${glow('g2', secondary, p * 0.75)}
<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${css(primary)}" stop-opacity="0"/><stop offset="0.5" stop-color="${css(primary)}" stop-opacity="${(p * 0.6).toFixed(3)}"/><stop offset="1" stop-color="${css(primary)}" stop-opacity="0"/></linearGradient>
<radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${dark ? 0.45 : 0.12}"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#base)"/>${shapes}<rect width="${W}" height="${H}" fill="url(#vig)"/></svg>`;
  return sharp(Buffer.from(svg))
    .composite([{ input: grain((a.seed ?? 7) * 31 + v, dark ? 0.045 : 0.03), raw: { width: W, height: H, channels: 4 }, blend: 'overlay' }])
    .removeAlpha()
    .png()
    .toBuffer();
}

/**
 * A middle carousel slide from the post's AI picture: re-framed (a different part, mirrored on every other slide),
 * softly blurred and darkened, so the series reads as one while the text gets a calm field.
 */
export async function reuseBackdrop(src: Buffer, variant: number): Promise<Buffer> {
  const zoom = 1.3;
  const big = await sharp(src, { failOn: 'error' })
    .rotate()
    .resize(Math.round(W * zoom), Math.round(H * zoom), { fit: 'cover' })
    .toBuffer();
  const spareX = Math.round(W * zoom) - W;
  const spareY = Math.round(H * zoom) - H;
  const spots: [number, number][] = [
    [0, 0],
    [spareX, spareY],
    [0, spareY],
    [spareX, 0],
  ];
  const [left, top] = spots[((variant % 4) + 4) % 4];
  let img = sharp(big).extract({ left, top, width: W, height: H });
  if (variant % 2 === 1) img = img.flop();
  return img.blur(16).modulate({ brightness: 0.72, saturation: 0.92 }).removeAlpha().png().toBuffer();
}
