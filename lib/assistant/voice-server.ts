import 'server-only';

import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Pronunciation } from './speech';
import { voiceSettings, type VoiceSettings } from './voice-profile';

/**
 * Sunny's voice on the server: the owner's settings and pronunciation fixes (read at most every 30 s), this month's
 * usage against the free quota, the usage counter, and the cache of fixed phrases (private storage bucket). Nothing
 * here fails a reply: if the database is busy, Sunny still speaks with the environment's settings.
 */
let cache: { at: number; settings: VoiceSettings; lexicon: Pronunciation[]; intensity: number } | null = null;

export async function voiceConfig(): Promise<{ settings: VoiceSettings; lexicon: Pronunciation[]; intensity: number }> {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  let stored: unknown = null;
  let lexicon: Pronunciation[] = [];
  let intensity = 2;
  try {
    const db = createAdminClient();
    const [s, l, p] = await Promise.all([
      db.from('app_settings').select('value').eq('key', 'assistant.voice').maybeSingle(),
      db.from('assistant_pronunciations').select('word, say_as').limit(500),
      db.from('assistant_personality').select('qitmir_intensity').eq('id', 1).maybeSingle(),
    ]);
    stored = s.data?.value ?? null;
    lexicon = l.data ?? [];
    intensity = Number((p.data as { qitmir_intensity?: number } | null)?.qitmir_intensity ?? 2) || 2;
  } catch {
    // not migrated yet or busy: environment defaults
  }
  cache = { at: Date.now(), settings: voiceSettings(process.env, stored), lexicon, intensity };
  return cache;
}

let used: { at: number; chars: number } | null = null;
/** Characters synthesised this month (cache hits excluded), read at most every minute. */
export async function monthChars(): Promise<number> {
  if (used && Date.now() - used.at < 60_000) return used.chars;
  try {
    const { data } = await createAdminClient().rpc('assistant_voice_month');
    const chars = (data ?? []).filter((r) => r.kind === 'tts').reduce((n, r) => n + Number(r.chars), 0);
    used = { at: Date.now(), chars };
    return chars;
  } catch {
    return used?.chars ?? 0;
  }
}

export async function recordVoice(kind: 'tts' | 'stt', provider: string, chars: number, audioMs = 0, cached = false): Promise<void> {
  if (used && kind === 'tts' && !cached) used.chars += chars;
  try {
    await createAdminClient().rpc('assistant_voice_record', { p_kind: kind, p_provider: provider, p_chars: cached ? 0 : chars, p_audio_ms: Math.round(audioMs), p_cached: cached });
  } catch {
    // bookkeeping never blocks the voice
  }
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);

const BUCKET = 'assistant-voice';
export async function cachedAudio(path: string): Promise<Buffer | null> {
  try {
    const { data } = await createAdminClient().storage.from(BUCKET).download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
export async function storeAudio(path: string, bytes: Buffer, type: string): Promise<void> {
  try {
    await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  } catch {
    // a missed cache write only costs one more synthesis later
  }
}

let sttUsed: { at: number; ms: number } | null = null;
/** Recognition time this month (ms), read at most every minute. */
export async function monthSttMs(): Promise<number> {
  if (sttUsed && Date.now() - sttUsed.at < 60_000) return sttUsed.ms;
  try {
    const { data } = await createAdminClient().rpc('assistant_voice_month');
    const ms = (data ?? []).filter((r) => r.kind === 'stt').reduce((n, r) => n + Number(r.audio_ms), 0);
    sttUsed = { at: Date.now(), ms };
    return ms;
  } catch {
    return sttUsed?.ms ?? 0;
  }
}
