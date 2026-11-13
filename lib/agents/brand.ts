/**
 * Brand DNA (pure): the client's identity as stored, read defensively. Colours are compared in OKLab (perceptual), so
 * "close to the brand green" means close to the eye, not in raw RGB. Contacts are only what the admin entered —
 * nothing here (or anywhere) invents a phone number.
 */
import { z } from 'zod';

import { normalizeColor } from './core';
import { hexToRgb, type Rgb } from './layout';

const list = (max: number, len = 200) => z.array(z.string().trim().max(len)).max(max).catch([]);
const str = (max: number) => z.string().trim().max(max).catch('');

export const dnaSchema = z.object({
  typography: z
    .object({ heading: str(80), body: str(80), heading_font_asset: z.string().uuid().nullable().catch(null), body_font_asset: z.string().uuid().nullable().catch(null) })
    .catch({ heading: '', body: '', heading_font_asset: null, body_font_asset: null }),
  accents: list(6, 9),
  gradients: list(6, 60),
  forbidden_colors: list(10, 9),
  color_tolerance: z.number().min(1).max(40).catch(12),
  style: str(200),
  positioning: str(600),
  slogans: list(12, 160),
  copy_rules: str(2000),
  cta_rules: str(600),
  disclaimers: str(600),
  forbidden_words: list(60, 80),
  forbidden_design: str(800),
  hashtags: list(30, 60),
  contacts: z
    .object({ phones: list(4, 40), telegram: str(64), instagram: str(64), website: str(200), address: str(300), hours: str(160) })
    .catch({ phones: [], telegram: '', instagram: '', website: '', address: '', hours: '' }),
  show_contacts: z.enum(['always', 'cta_only', 'never']).catch('cta_only'),
  logo_position: z.enum(['top-left', 'top-right', 'top-center', 'bottom-right']).catch('top-left'),
});
export type BrandDna = z.infer<typeof dnaSchema>;

export const parseDna = (raw: unknown): BrandDna => dnaSchema.parse(raw && typeof raw === 'object' ? raw : {});

// ---------------------------------------------------------------------------------------------------------------
// Colour science (sRGB → OKLab) for tolerance checks.
// ---------------------------------------------------------------------------------------------------------------
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export function oklab([r, g, b]: Rgb): [number, number, number] {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** Perceptual distance ×100 (≈ JND at 2; "clearly different" above ~10). */
export function colorDistance(a: Rgb, b: Rgb): number {
  const x = oklab(a);
  const y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

export type ColorCheck = { forbidden: { color: string; share: number }[]; offBrand: number; brandShare: number };

/**
 * The image's dominant colours (with their share) against the brand: any forbidden colour within tolerance and
 * covering ≥ 3% is reported; offBrand is the share far from every brand colour (backgrounds may legitimately be photos,
 * so it is a signal for the reviewer, not a failure).
 */
export function checkColors(dominant: { rgb: Rgb; share: number }[], brand: string[], forbidden: string[], tolerance = 12): ColorCheck {
  const brandRgb = brand.map((h) => normalizeColor(h)).filter((h): h is string => !!h).map((h) => hexToRgb(h, [0, 0, 0]));
  const out: ColorCheck = { forbidden: [], offBrand: 0, brandShare: 0 };
  for (const f of forbidden.map((h) => normalizeColor(h)).filter((h): h is string => !!h)) {
    const rgb = hexToRgb(f, [0, 0, 0]);
    const share = dominant.filter((d) => colorDistance(d.rgb, rgb) <= tolerance).reduce((n, d) => n + d.share, 0);
    if (share >= 0.03) out.forbidden.push({ color: f, share: Math.round(share * 100) / 100 });
  }
  for (const d of dominant) {
    const near = brandRgb.some((b) => colorDistance(d.rgb, b) <= tolerance * 1.5);
    const neutral = Math.max(...d.rgb) - Math.min(...d.rgb) < 18; // greys, black, white
    if (near) out.brandShare += d.share;
    else if (!neutral) out.offBrand += d.share;
  }
  out.offBrand = Math.round(out.offBrand * 100) / 100;
  out.brandShare = Math.round(out.brandShare * 100) / 100;
  return out;
}

/** The brand colours the admin set (profile colours + DNA accents), as #RRGGBB. */
export function brandColors(colors: Record<string, unknown> | null | undefined, dna: BrandDna): string[] {
  const c = (colors ?? {}) as Record<string, string>;
  return [c.primary, c.secondary, c.bg, c.text, ...dna.accents].map((h) => normalizeColor(h)).filter((h): h is string => !!h);
}

// ---------------------------------------------------------------------------------------------------------------
// Contacts: only verified values; the image shows one phone at most.
// ---------------------------------------------------------------------------------------------------------------
export type Contacts = { phones: string[]; telegram: string | null; instagram: string | null; website: string | null; address: string | null; hours: string | null };

export function contactsOf(p: { phone: string | null; telegram: string | null; instagram_username: string | null; website: string | null; address: string | null }, dna: BrandDna): Contacts {
  const phones = [...new Set([p.phone, ...dna.contacts.phones].map((x) => (x ?? '').trim()).filter((x) => x.replace(/\D/g, '').length >= 7))];
  const clean = (s: string | null | undefined) => (s ?? '').trim() || null;
  return {
    phones,
    telegram: clean(dna.contacts.telegram) ?? clean(p.telegram),
    instagram: clean(dna.contacts.instagram) ?? clean(p.instagram_username),
    website: clean(dna.contacts.website) ?? clean(p.website),
    address: clean(dna.contacts.address) ?? clean(p.address),
    hours: clean(dna.contacts.hours),
  };
}

/** The contact line printed on an image (or nothing): verified phone, else @instagram. */
export function contactLine(c: Contacts, mode: BrandDna['show_contacts'], isCtaFrame: boolean): string | null {
  if (mode === 'never' || (mode === 'cta_only' && !isCtaFrame)) return null;
  const parts = [c.phones[0] ?? null, c.instagram ? `@${c.instagram.replace(/^@/, '')}` : c.telegram ? `@${c.telegram.replace(/^@/, '')}` : null].filter(Boolean);
  return parts.length ? parts.join('  ·  ') : null;
}

/** Which logo variant suits a background (mean luminance of the logo zone 0–1): light logo on dark, dark on light. */
export function logoVariantFor(zoneLuminance: number, has: { logo: boolean; light: boolean; dark: boolean }): 'logo' | 'logo_light' | 'logo_dark' | null {
  if (zoneLuminance < 0.45 && has.light) return 'logo_light';
  if (zoneLuminance >= 0.55 && has.dark) return 'logo_dark';
  if (has.logo) return 'logo';
  return has.light ? 'logo_light' : has.dark ? 'logo_dark' : null;
}
