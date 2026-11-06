/**
 * Exact decimal arithmetic for provider prices: the provider sends tariffs as strings ("1500.00", "11489.69"); they are
 * kept as integers scaled by a power of ten, never as floating point, so no tariff changes by a rounding error.
 */

export type Dec = { n: bigint; s: number };

const TEN = 10n;
const pow10 = (k: number) => TEN ** BigInt(k);

/** "1500.00" → {150000n, 2}. Accepts numbers (as the provider might send them), rejects anything else. */
export function parseDec(value: unknown): Dec | null {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = Math.abs(value) < 1e21 ? value.toFixed(10).replace(/\.?0+$/, '') : String(value);
  } else if (typeof value === 'string') text = value.trim();
  else return null;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return null;
  const frac = m[3] ?? '';
  return { n: BigInt(`${m[1] ?? ''}${m[2]}${frac}`), s: frac.length };
}

/** Canonical text, full precision: {150000n, 2} → "1500.00". */
export function decText(d: Dec): string {
  const neg = d.n < 0n;
  const digits = (neg ? -d.n : d.n).toString().padStart(d.s + 1, '0');
  const int = digits.slice(0, digits.length - d.s);
  const frac = d.s ? `.${digits.slice(digits.length - d.s)}` : '';
  return `${neg ? '-' : ''}${int}${frac}`;
}

/** Compare two decimals exactly (−1, 0, 1). */
export function decCmp(a: Dec, b: Dec): number {
  const s = Math.max(a.s, b.s);
  const x = a.n * pow10(s - a.s);
  const y = b.n * pow10(s - b.s);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** rate × quantity ÷ unit, rounded half up to `places` (an estimate of the provider charge, never the tariff itself). */
export function estimate(rate: Dec, quantity: bigint, unit: bigint, places = 2): Dec {
  if (unit <= 0n) throw new RangeError('unit must be positive');
  const num = rate.n * quantity * pow10(places);
  const den = pow10(rate.s) * unit;
  let q = num / den;
  const r = num % den;
  if (r * 2n >= den) q += 1n;
  return { n: q, s: places };
}

/** UZS for people: "22 000 so‘m", "1 555,20 so‘m", "0,375 so‘m" — the value itself is not rounded. */
export function formatSom(value: Dec | string | null | undefined, currency = 'UZS'): string {
  const d = typeof value === 'string' ? parseDec(value) : value;
  if (!d) return '—';
  const [intPart, fracPart = ''] = decText(d).replace('-', '').split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const trimmed = fracPart.replace(/0+$/, '');
  const frac = trimmed ? `,${trimmed.padEnd(2, '0')}` : '';
  const unit = currency.toUpperCase() === 'UZS' ? 'so‘m' : currency;
  return `${d.n < 0n ? '−' : ''}${grouped}${frac} ${unit}`;
}
