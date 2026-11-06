/**
 * Splitting one confirmed total into ordinary orders (pure; unit-tested). Every part is an integer within the live
 * min / max and the parts add up to the total exactly; a total that cannot be split that way is refused with the
 * nearest totals that can — never rounded up silently. The number of parts is bounded (one provider order each).
 */

export const MAX_PARTS = 30;
export const MAX_WINDOW_HOURS = 24 * 30;

export type Split = { ok: true; parts: number[] } | { ok: false; error: string; nearest?: number[] };

const fmt = (n: number) => n.toLocaleString('ru-RU');

/** n parts are possible exactly when n × min ≤ total ≤ n × max. */
export function splitQuantity({
  total,
  min,
  max,
  preferred,
  even = false,
  maxParts = MAX_PARTS,
}: {
  total: number;
  min: number;
  max: number;
  /** The owner's preferred part size; the number of parts follows from it. */
  preferred?: number | null;
  /** Equal parts (± 1) instead of preferred-size parts with the remainder spread. */
  even?: boolean;
  maxParts?: number;
}): Split {
  if (![total, min, max].every(Number.isSafeInteger) || min < 1 || max < min) return { ok: false, error: 'Xizmat chegaralari (min / max) noto‘g‘ri.' };
  if (total < 1) return { ok: false, error: 'Jami miqdorni butun son bilan kiriting.' };
  if (total < min) return { ok: false, error: `Jami ${fmt(total)} ta — bu xizmatda eng kami ${fmt(min)} ta. Miqdor avtomatik oshirilmaydi: kamida ${fmt(min)} kiriting.` };

  const fewest = Math.ceil(total / max);
  const most = Math.floor(total / min);
  if (fewest > most) {
    const below = most * max;
    const above = fewest * min;
    return {
      ok: false,
      error: `${fmt(total)} ni ${fmt(min)}–${fmt(max)} oralig‘idagi butun qismlarga aniq bo‘lib bo‘lmaydi. Jami miqdorni o‘zgartiring: masalan ${fmt(below)} yoki ${fmt(above)}.`,
      nearest: [below, above].filter((x) => x >= min),
    };
  }
  if (fewest > maxParts)
    return {
      ok: false,
      error: `Bu jami kamida ${fmt(fewest)} ta buyurtma bo‘ladi (har biri ko‘pi bilan ${fmt(max)}). Bir rejada ${maxParts} tagacha qism bo‘ladi — jamini kamaytiring yoki bir necha reja tuzing.`,
    };

  const size = preferred && Number.isSafeInteger(preferred) && preferred > 0 ? Math.min(max, Math.max(min, preferred)) : null;
  let n = size ? Math.round(total / size) : fewest;
  n = Math.min(Math.max(n, fewest), most, maxParts);

  if (even || !size) {
    const base = Math.floor(total / n);
    const extra = total % n;
    // The larger parts go last: 103 + 103 + 104.
    return { ok: true, parts: Array.from({ length: n }, (_, i) => base + (i >= n - extra ? 1 : 0)) };
  }
  const parts = Array<number>(n).fill(size);
  let diff = total - n * size;
  for (let i = n - 1; i >= 0 && diff !== 0; i--) {
    const step = diff > 0 ? Math.min(diff, max - parts[i]) : -Math.min(-diff, parts[i] - min);
    parts[i] += step;
    diff -= step;
  }
  return diff === 0 ? { ok: true, parts } : { ok: false, error: 'Bo‘lib bo‘lmadi — boshqa qism hajmini tanlang.' };
}

/** Nominal sending times: the first at the start, the last at start + window, evenly spaced (whole seconds). */
export function sendingTimes(startMs: number, windowSeconds: number, n: number): { spacingSeconds: number; times: number[] } {
  const spacingSeconds = n > 1 ? Math.floor(windowSeconds / (n - 1)) : 0;
  return { spacingSeconds, times: Array.from({ length: n }, (_, i) => startMs + i * spacingSeconds * 1000) };
}

/**
 * The revised estimate of when the unsent parts go out, from the actual progress: a part is never before its planned
 * time, never sooner than the spacing after the previous one, never in the past. Waiting for the previous order to
 * finish can push it further; that is unknown ahead, so this is a lower bound.
 */
export function projectSending(parts: { state: string; due_at: string; dispatched_at?: string | null }[], spacingSeconds: number, nowMs: number): (number | null)[] {
  let prev: number | null = null;
  return parts.map((p) => {
    if (p.state !== 'planned') {
      const at = p.dispatched_at ? Date.parse(p.dispatched_at) : null;
      if (at !== null && ['sent', 'sending', 'unknown', 'dispatching'].includes(p.state)) prev = at;
      return null;
    }
    const at = Math.max(Date.parse(p.due_at), nowMs, prev === null ? -Infinity : prev + spacingSeconds * 1000);
    prev = at;
    return at;
  });
}
