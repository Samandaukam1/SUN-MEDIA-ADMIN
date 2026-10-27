/**
 * Sunny before anyone asks (§36 daily rituals, §38 proactive assistant, §43 notifications): which short line to offer
 * and when. Rituals are once a day and cost nothing until the person says "ha" (then the system's own briefing answers,
 * without the AI); notifications come from the person's own live notification feed (the bell), never from polling.
 * The person chooses what Sunny may mention and whether aloud. Pure functions.
 */

export type Prefs = { rituals: boolean; tasks: boolean; deadlines: boolean; approvals: boolean; shootings: boolean; chat: boolean; speak: boolean };
/** Visual nudges on for work events, chat off (every message would be too much), speech off until chosen. */
export const DEFAULT_PREFS: Prefs = { rituals: true, tasks: true, deadlines: true, approvals: true, shootings: true, chat: false, speak: false };
export const PREF_LABELS: [keyof Prefs, string][] = [
  ['rituals', 'Ertalabki salom va kechki eslatma'],
  ['tasks', 'Yangi va o‘zgargan vazifalar'],
  ['deadlines', 'Yaqin muddatlar'],
  ['approvals', 'Tasdiq va kontent'],
  ['shootings', 'S’yomkalar'],
  ['chat', 'Chat xabarlari'],
  ['speak', 'Ovoz chiqarib aytish'],
];

export function readPrefs(raw: string | null): Prefs {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return Object.fromEntries(Object.entries(DEFAULT_PREFS).map(([k, v]) => [k, typeof p[k as keyof Prefs] === 'boolean' ? p[k as keyof Prefs] : v])) as Prefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export type Mode = 'normal' | 'professional' | 'qitmir';
export type Nudge = { key: string; text: string; ask?: string; href?: string | null; label: string };

/** The day's ritual for this hour, if any and not yet offered today (`done` = the kinds already offered today). */
export function ritualFor(hour: number, audience: 'staff' | 'client', mode: Mode, done: string[]): Nudge | null {
  if (hour >= 6 && hour < 11 && !done.includes('morning')) {
    const text =
      audience === 'client'
        ? mode === 'professional'
          ? 'Xayrli tong. Loyihangiz holatini ko‘rsataymi?'
          : 'Xayrli tong! ☀️ Loyihangiz holatini ko‘rsataymi?'
        : mode === 'professional'
          ? 'Xayrli tong. Bugungi ishlaringizni ko‘rsataymi?'
          : mode === 'qitmir'
            ? 'Xayrli tong! Uyg‘ondingizmi? 😏 Bugungi ishlarni aytib beraymi?'
            : 'Xayrli tong! ☀️ Bugungi ishlaringizni aytib beraymi?';
    return { key: 'morning', text, ask: audience === 'client' ? 'Loyihamiz holati qanday?' : 'Bugun qanday ishlarim bor?', label: 'Ha, ayt' };
  }
  if (audience === 'staff' && hour >= 17 && hour < 21 && !done.includes('evening')) {
    const text = mode === 'qitmir' ? 'Kun tugayapti-yu, ishlar-chi? 😏 Tugamaganlarini ko‘rib chiqamizmi?' : 'Kun yakunlanmoqda. Tugamagan ishlarni ko‘rib chiqamizmi?';
    return { key: 'evening', text, ask: 'Vazifalarim', label: 'Ko‘rib chiqamiz' };
  }
  return null;
}

/** Which of the person's choices a notification falls under (`null`: Sunny keeps quiet about it). */
export function categoryOf(type: string): keyof Prefs | null {
  if (/deadline|overdue|muddat/.test(type)) return 'deadlines';
  if (type.startsWith('task.')) return 'tasks';
  if (type.startsWith('content.') || /approv|version|revision/.test(type)) return 'approvals';
  if (type.startsWith('shooting.')) return 'shootings';
  if (type.startsWith('chat.')) return 'chat';
  return null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Sunny's line for a new notification, or null when the person chose not to hear about this kind. */
export function nudgeFor(n: { id: string; type: string; title: string; body: string | null; href: string | null }, prefs: Prefs): Nudge | null {
  const kind = categoryOf(n.type);
  if (!kind || !prefs[kind]) return null;
  const body = (n.body ?? '').trim();
  const text =
    n.type === 'task.assigned' || n.type === 'task.created'
      ? `Sizga yangi vazifa kelibdi: “${clip(body.split('. Deadline')[0] || n.title, 90)}”. Ko‘rib chiqamizmi?`
      : `${clip(n.title, 80)}${body ? `: ${clip(body, 90)}` : ''}${n.href ? ' Ko‘rib chiqamizmi?' : ''}`;
  return { key: `n:${n.id}`, text, href: n.href, label: 'Ochish' };
}
