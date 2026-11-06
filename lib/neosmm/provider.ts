/**
 * Talking to NeoSMM: one fixed endpoint, POST form-urlencoded, the key only in the body. HTTP 200 can still carry
 * `{"error": …}`. Reads retry a little on network trouble; a mutation (add / gift_add / donat_add / cancel / refill) is
 * sent once and never again by itself — when its fate is unclear the answer says so (`accepted: 'unknown'`).
 * Nothing here logs the key, the request body or the provider's raw answer.
 */

import { MISSING_KEY, translateError, toInt } from './catalog';

export const NEOSMM_ENDPOINT = 'https://neosmm.uz/api/v2';

export type ProviderError = {
  ok: false;
  reason: 'config' | 'provider' | 'unavailable' | 'network' | 'timeout' | 'bad_response';
  /** Uzbek, safe to show. */
  message: string;
  /** The provider's own error text (shown as text; not logged). */
  raw?: string;
  retryAfter?: number;
  /** For mutations: 'no' — the provider certainly did not take it; 'unknown' — it may have. */
  accepted: 'no' | 'unknown';
  body?: Record<string, unknown>;
};
export type ProviderResult = { ok: true; data: unknown } | ProviderError;
export type Call = (params: Record<string, string>, opts?: { mutation?: boolean }) => Promise<ProviderResult>;

// Connection never made: the request did not leave this server.
const NOT_SENT = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_INVALID_URL|CERT_|UNABLE_TO_VERIFY/;

export function createProvider({
  key,
  fetchImpl = fetch,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  readTimeoutMs = 12_000,
  writeTimeoutMs = 30_000,
}: {
  key: string | undefined;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
}): Call {
  return async (params, { mutation = false } = {}) => {
    const apiKey = key?.trim();
    if (!apiKey) return { ok: false, reason: 'config', message: MISSING_KEY, accepted: 'no' };
    const attempts = mutation ? 1 : 3;
    let last: ProviderError = { ok: false, reason: 'network', message: 'NeoSMM bilan aloqa yo‘q.', accepted: 'no' };
    for (let i = 0; i < attempts; i++) {
      if (i) await sleep(400 * 3 ** (i - 1));
      let res: Response;
      try {
        res = await fetchImpl(NEOSMM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ ...params, key: apiKey }).toString(),
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(mutation ? writeTimeoutMs : readTimeoutMs),
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        const detail = `${(e as { cause?: { code?: string } })?.cause?.code ?? ''} ${(e as { message?: string })?.message ?? ''}`;
        const timeout = name === 'TimeoutError' || name === 'AbortError';
        last = {
          ok: false,
          reason: timeout ? 'timeout' : 'network',
          message: timeout ? 'NeoSMM javob bermadi (vaqt tugadi).' : 'NeoSMM bilan aloqa yo‘q.',
          accepted: !timeout && NOT_SENT.test(detail) ? 'no' : 'unknown',
        };
        if (mutation) return last;
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(await res.text());
      } catch {
        json = undefined;
      }
      if (json && typeof json === 'object' && !Array.isArray(json) && 'error' in json) {
        const body = json as Record<string, unknown>;
        // The provider's words, kept for the record — with the key cut out should it ever be echoed back.
        const raw = (typeof body.error === 'string' ? body.error : 'Error').split(apiKey).join('[kalit]').slice(0, 1000);
        const retryAfter = toInt(body.retry_after) ?? undefined;
        // The provider answered with an error: it did not take the request.
        return { ok: false, reason: retryAfter ? 'unavailable' : 'provider', message: translateError(raw, retryAfter), raw, retryAfter, accepted: 'no', body };
      }
      if (res.ok && json !== undefined) return { ok: true, data: json };
      last = {
        ok: false,
        reason: 'bad_response',
        message: res.status >= 500 ? 'NeoSMM serverida nosozlik.' : 'NeoSMM tushunarsiz javob qaytardi.',
        accepted: 'unknown',
      };
      if (mutation) return last;
      if (res.status < 500 && json === undefined && res.status !== 429) break;
    }
    return last;
  };
}
