/**
 * Service availability from evidence only (pure; unit-tested). There is no free "is this service working" call in the
 * documented API and no test orders are placed: the state comes from orders actually made here, from explicit refusals
 * of the service id, from the catalogue and from the owner's own switch. Nothing here ever says "100% ishlaydi".
 */

export type ErrorKind = 'service' | 'account' | 'balance' | 'input' | 'active_order' | 'maintenance' | 'network' | 'other';

/**
 * What a refusal is about. Only "service" says something about the service itself (and only when the id we sent was
 * the catalogue's own value — the caller checks that); the key, the balance, the input, rate limits, maintenance and
 * the network never mark a service as broken.
 */
export function classifyProviderError(raw: string | null | undefined, retryAfter?: number | null): ErrorKind {
  const m = (raw ?? '').trim();
  if (retryAfter) return 'maintenance';
  if (/invalid api key|api access is disabled|account (is )?(disabled|blocked|suspended)/i.test(m)) return 'account';
  if (/insufficient (balance|funds)|not enough (funds|balance)|low balance/i.test(m)) return 'balance';
  if (/too many requests|rate limit|maintenance|temporarily unavailable/i.test(m)) return 'maintenance';
  if (/active order|already (have|has) (an? )?(active )?order|wait until .*order|order .*in progress/i.test(m)) return 'active_order';
  if (/incorrect service|invalid service|service (id )?(is )?(disabled|not found|not active|unavailable|does not exist)/i.test(m)) return 'service';
  if (/quantity|min(imum)?\b|max(imum)?\b|link|url|username|invalid (comments|hashtag|answer)|private/i.test(m)) return 'input';
  return 'other';
}

export type HealthRow = {
  service_id: number;
  service_name: string | null;
  service_category: string | null;
  last_accepted_at: string | null;
  last_accepted_order: string | null;
  last_completed_at: string | null;
  last_completed_order: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  missing_since: string | null;
  last_seen_at: string | null;
  disabled_at: string | null;
  cleared_at: string | null;
  refill_days: number | null;
  refill_starts: 'accepted' | 'completed' | null;
  refill_basis: string | null;
  refill_verified_at: string | null;
};

export type HealthState = 'untested' | 'accepted' | 'completed' | 'blocked' | 'removed' | 'disabled';
export type Health = {
  state: HealthState;
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  /** The evidence time. */
  at: string | null;
  reason: string | null;
  /** New orders are allowed (blocked, removed and disabled services take none). */
  orderable: boolean;
};

export const HEALTH_LABEL: Record<HealthState, string> = {
  untested: 'Tekshirilmagan',
  accepted: 'Buyurtma qabul qilingan',
  completed: 'Yaqinda bajarilgan',
  blocked: 'Vaqtincha bloklangan',
  removed: 'Katalogdan olib tashlangan',
  disabled: 'Qo‘lda o‘chirilgan',
};

/** "Yaqinda": a Completed order recorded within this many days. */
export const RECENT_DAYS = 30;

const after = (at: string | null, from: string | null) => !!at && (!from || Date.parse(at) > Date.parse(from));

export function healthOf(row: HealthRow | null | undefined, nowMs = Date.now()): Health {
  if (!row) return { state: 'untested', label: HEALTH_LABEL.untested, tone: 'neutral', at: null, reason: null, orderable: true };
  if (row.disabled_at) return { state: 'disabled', label: HEALTH_LABEL.disabled, tone: 'neutral', at: row.disabled_at, reason: 'Egasi o‘chirib qo‘ygan', orderable: false };
  if (row.blocked_at)
    return { state: 'blocked', label: HEALTH_LABEL.blocked, tone: 'danger', at: row.blocked_at, reason: row.blocked_reason ?? 'Provayder xizmat ID sini rad etdi', orderable: false };
  if (row.missing_since)
    return { state: 'removed', label: HEALTH_LABEL.removed, tone: 'warning', at: row.missing_since, reason: 'Yangi olingan katalogda yo‘q', orderable: false };
  const completed = after(row.last_completed_at, row.cleared_at) ? row.last_completed_at : null;
  if (completed && nowMs - Date.parse(completed) <= RECENT_DAYS * 86_400_000)
    return { state: 'completed', label: HEALTH_LABEL.completed, tone: 'success', at: completed, reason: null, orderable: true };
  const accepted = after(row.last_accepted_at, row.cleared_at) ? row.last_accepted_at : null;
  if (accepted && (!completed || Date.parse(accepted) > Date.parse(completed)))
    return { state: 'accepted', label: HEALTH_LABEL.accepted, tone: 'info', at: accepted, reason: 'Bajarilgani hali tasdiqlanmagan', orderable: true };
  return {
    state: 'untested',
    label: HEALTH_LABEL.untested,
    tone: 'neutral',
    at: completed,
    reason: completed ? 'Oxirgi tasdiqlangan bajarilish eski' : null,
    orderable: true,
  };
}

export type HealthFilter = 'recent' | 'untested' | 'problem' | 'all';
export const HEALTH_FILTERS: { key: HealthFilter; label: string }[] = [
  { key: 'recent', label: 'Yaqinda bajarilgan' },
  { key: 'untested', label: 'Tekshirilmagan' },
  { key: 'problem', label: 'Muammoli' },
  { key: 'all', label: 'Barchasi' },
];

export function inFilter(state: HealthState, filter: HealthFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'recent') return state === 'completed';
  if (filter === 'untested') return state === 'untested';
  return state === 'blocked' || state === 'removed' || state === 'disabled';
}
