import type { Mood } from './voice-profile';

/**
 * The mood of one reply, from what really happened — no extra AI call (pure, unit-tested). The system's own results
 * decide first (a change confirmed → proud / happy; refused or failed → sad, or a mock frown in Qitmir mode); then the
 * reply's shape (a question back → thinking; good news with "!" → excited); Qitmir mode leans mischievous, and a
 * repeated question gets a mock-annoyed one. Calm by default: the face does not jump around on every sentence.
 */
export type MoodInput = {
  reply: string;
  ok?: boolean | null;
  celebrate?: boolean;
  failed?: boolean;
  mode?: 'qitmir' | 'professional' | null;
  repeated?: boolean;
  hour?: number;
};

const SURPRISE = /\b(voy|vay|qarang-a|ajabo|nahotki|o‘h-ho|wow)\b/i;
const SARCASM = /(albatta-da|qoyil|xuddi shunday-da|nimasini aytasiz|ha-ha|😏)/i;

export function replyMood(i: MoodInput): Mood {
  const t = i.reply.trim();
  if (i.mode === 'professional') return i.failed || i.ok === false ? 'thinking' : 'neutral';
  if (i.failed || i.ok === false) return i.mode === 'qitmir' ? 'mock_angry' : 'sad';
  if (i.celebrate) return 'proud';
  if (i.ok) return i.mode === 'qitmir' ? 'mischievous' : 'happy';
  if (i.repeated && i.mode === 'qitmir') return 'annoyed';
  if (i.mode === 'qitmir') return SARCASM.test(t) ? 'sarcastic' : 'mischievous';
  if (SURPRISE.test(t)) return 'surprised';
  if (/\?\s*$/.test(t)) return 'thinking';
  if (/!/.test(t.slice(0, 80)) && /(zo‘r|ajoyib|tabriklayman|a’lo|qoyil|barakalla)/i.test(t)) return 'excited';
  if (i.hour !== undefined && (i.hour >= 23 || i.hour < 6) && t.length < 120) return 'sleepy';
  return 'neutral';
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ’‘`'?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The person asked the same thing again (the last two questions, same words or nearly so). */
export function isRepeat(history: { role: 'user' | 'assistant'; text: string }[]): boolean {
  const asked = history.filter((m) => m.role === 'user').map((m) => fold(m.text));
  if (asked.length < 2) return false;
  const [a, b] = asked.slice(-2);
  if (!a || !b) return false;
  if (a === b) return true;
  const wa = new Set(a.split(' '));
  const wb = new Set(b.split(' '));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return wa.size >= 3 && inter / (wa.size + wb.size - inter) >= 0.8;
}
