/** Pure helpers of the chat's voice / round video messages (no browser or Supabase: unit-tested). */

/** The internal chat screens (panel, staff cabinet, partner cabinet): Sunny steps aside there. */
export const CHAT_ROUTE = /^\/(?:chat|xodim\/chat|kabinet\/chat)(?:\/|$)/;

/** One line for a message in a reply quote or a list: its text, or what kind of message it is. */
export function messagePreview(m: { body: string; kind?: string | null; deleted_at?: string | null }): string {
  if (m.deleted_at) return 'Xabar o‘chirilgan';
  if (m.kind === 'voice') return '🎤 Ovozli xabar';
  if (m.kind === 'round_video') return '📹 Video xabar';
  return m.body || 'Fayl';
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Raw loudness samples → `bars` values 0–100 (stored with the voice message, drawn without downloading the audio). */
export function toWaveform(samples: number[], bars = 48): number[] {
  if (!samples.length) return [];
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / bars));
    out.push(Math.max(...samples.slice(from, to)));
  }
  const peak = Math.max(...out, 0.0001);
  return out.map((v) => Math.round(Math.min(1, v / peak) * 100));
}
