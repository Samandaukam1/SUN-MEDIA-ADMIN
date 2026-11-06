/**
 * Refill guarantees, per provider order (pure; unit-tested). The API only says whether refill can be requested; the
 * duration and the event it starts from come from terms the owner has verified and recorded for the service. Each
 * order keeps the snapshot it was placed with — a later catalogue or setting change does not rewrite it.
 * "R30" in a service name proves nothing and is never used.
 */

export type RefillPolicy = {
  /** The provider's catalogue said refill can be requested for this service (at submission). */
  api: boolean;
  /** The owner verified the terms below. */
  verified: boolean;
  days?: number | null;
  /** accepted: from the provider accepting the order; completed: from the order being completed. */
  starts?: 'accepted' | 'completed' | null;
  basis?: string | null;
  verified_at?: string | null;
};

export function policyFrom(api: boolean, terms: { refill_days: number | null; refill_starts: 'accepted' | 'completed' | null; refill_basis: string | null; refill_verified_at: string | null } | null): RefillPolicy {
  if (!terms?.refill_days || !terms.refill_starts || !terms.refill_verified_at) return { api, verified: false };
  return { api, verified: true, days: terms.refill_days, starts: terms.refill_starts, basis: terms.refill_basis, verified_at: terms.refill_verified_at };
}

export function readPolicy(v: unknown): RefillPolicy | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  const days = typeof p.days === 'number' && Number.isInteger(p.days) && p.days > 0 ? p.days : null;
  const starts = p.starts === 'accepted' || p.starts === 'completed' ? p.starts : null;
  const verified = p.verified === true && !!days && !!starts;
  return {
    api: p.api === true,
    verified,
    days: verified ? days : null,
    starts: verified ? starts : null,
    basis: typeof p.basis === 'string' ? p.basis.slice(0, 500) : null,
    verified_at: typeof p.verified_at === 'string' ? p.verified_at : null,
  };
}

export type RefillClock =
  | { kind: 'unverified'; label: string }
  | { kind: 'waiting'; label: string }
  | { kind: 'running'; label: string; startsAt: number; expiresAt: number; remainingMs: number; startEstimated: boolean }
  | { kind: 'expired'; label: string; startsAt: number; expiresAt: number; startEstimated: boolean };

export const UNVERIFIED_TERM = 'Muddat tasdiqlanmagan';

/** Server timestamps in, the countdown state out (never negative). */
export function refillClock(policy: RefillPolicy | null, acceptedAt: string | null, completedAt: string | null, nowMs: number): RefillClock {
  if (!policy?.verified || !policy.days || !policy.starts) return { kind: 'unverified', label: UNVERIFIED_TERM };
  const start = policy.starts === 'accepted' ? acceptedAt : completedAt;
  if (!start) return { kind: 'waiting', label: policy.starts === 'completed' ? 'Buyurtma bajarilgach boshlanadi' : 'Provayder qabul qilgach boshlanadi' };
  const startsAt = Date.parse(start);
  const expiresAt = startsAt + policy.days * 86_400_000;
  // "completed" is the first status check that saw Completed — a few minutes after the provider's own moment at most.
  const startEstimated = policy.starts === 'completed';
  if (nowMs >= expiresAt) return { kind: 'expired', label: 'Muddat tugadi', startsAt, expiresAt, startEstimated };
  return { kind: 'running', label: 'Kafolat muddati', startsAt, expiresAt, remainingMs: expiresAt - nowMs, startEstimated };
}

/** "12 kun 04:05:09" */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const hh = String(Math.floor((s % 86_400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${d ? `${d} kun ` : ''}${hh}:${mm}:${ss}`;
}
