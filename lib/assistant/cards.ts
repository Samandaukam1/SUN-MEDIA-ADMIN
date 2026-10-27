/**
 * Holographic cards (§34): in a voice conversation Sunny answers aloud and shows the few facts that help — task, client,
 * time, status, one link — as small cards by the robot, instead of opening the chat panel. Built from the same tool
 * result the reply comes from (nothing new is read for them). Pure functions.
 */

export type HoloCard = { title: string; sub?: string | null; time?: string | null; status?: string | null; warn?: boolean; href?: string | null };
export type HoloDeck = { type: 'cards'; title: string; items: HoloCard[]; more: number };

const TASK: Record<string, string> = { todo: 'Navbatda', in_progress: 'Jarayonda', in_review: 'Tekshiruvda', revision: 'Qayta ishlash', done: 'Bajarildi', cancelled: 'Bekor' };
const SHOOT: Record<string, string> = { planned: 'Rejada', confirmed: 'Tasdiqlangan', in_progress: 'Ketmoqda', completed: 'Tugadi', postponed: 'Ko‘chirilgan', cancelled: 'Bekor' };
const MAX = 6;

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const clip = (v: string | null, n: number) => (v && v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);
const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ') || null;

/** The rows of a tool result: an action's `malumot`, or a read tool's plain array. */
function rows(content: string): unknown {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) return parsed;
    const r = parsed as { holat?: string; malumot?: unknown };
    return r && r.holat !== 'BAJARILMADI' ? r.malumot : null;
  } catch {
    return null;
  }
}

const deck = (title: string, items: HoloCard[]): HoloDeck | null => (items.length ? { type: 'cards', title, items: items.slice(0, MAX), more: Math.max(0, items.length - MAX) } : null);

const taskCard = (t: Row, href: (id: string) => string): HoloCard => ({
  title: s(t.vazifa) ?? 'Vazifa',
  sub: s(t.mijoz),
  time: s(t.muddat),
  status: TASK[String(t.holat)] ?? s(t.holat),
  warn: t.muddati_otgan === true,
  href: s(t.id) ? href(String(t.id)) : null,
});

/** The cards for a tool's result, or null when it has nothing worth showing. `taskHref` follows the person's area. */
export function cardsFor(tool: string, content: string, taskHref: (id: string) => string): HoloDeck | null {
  const data = rows(content);
  if (!data) return null;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);
  switch (tool) {
    case 'list_tasks':
      return deck('Vazifalar', list(data).map((t) => taskCard(t, taskHref)));
    case 'upcoming_shootings':
      return deck(
        'S’yomkalar',
        list(data).map((x) => ({ title: s(x.syomka) ?? 'S’yomka', sub: join(s(x.mijoz), s(x.joy)), time: s(x.boshlanishi), status: SHOOT[String(x.holat)] ?? null })),
      );
    case 'risks':
      return deck(
        'Ehtimoliy xavflar',
        list(data).map((r) => ({ title: (s(r.tur) ?? 'Xavf').replace(/^./, (c) => c.toUpperCase()), sub: clip(s(r.nima), 140), warn: r.daraja === 'yuqori', status: r.daraja === 'yuqori' ? 'Yuqori' : 'O‘rta', href: s(r.havola) })),
      );
    case 'my_approvals':
      return deck(
        'Tasdiqingizni kutmoqda',
        list(data).map((v) => ({ title: s(v.kontent) ?? 'Kontent', sub: join(s(v.turi), v.versiya ? `${v.versiya}-versiya` : null), time: s(v.tasdiq_muddati), warn: v.muddati_otgan === true, status: v.muddati_otgan === true ? 'Muddati o‘tgan' : 'Kutmoqda' })),
      );
    case 'briefing': {
      const b = data as { vazifalar?: unknown; syomkalar?: unknown; kontent?: unknown };
      return deck('Bugungi kun', [
        ...list(b.syomkalar).map((x) => ({ title: s(x.syomka) ?? 'S’yomka', sub: join(s(x.mijoz), s(x.joy)), time: s(x.vaqt), status: 'S’yomka', href: s(x.havola) })),
        ...list(b.vazifalar).map((t) => taskCard(t, taskHref)),
        ...list(b.kontent).map((k) => ({ title: s(k.kontent) ?? 'Kontent', sub: s(k.mijoz), time: s(k.post) ?? s(k.muddat), status: s(k.bosqich), href: s(k.havola) })),
      ]);
    }
    case 'partner_status': {
      const views = Array.isArray(data) ? (data as Row[]) : [data as Row];
      return deck(
        'Loyiha',
        views.flatMap((v) => list(v.kontent).map((k) => ({ title: s(k.kontent) ?? 'Kontent', sub: s(k.turi), time: s(k.post), status: s(k.bosqich), warn: !!k.tasdiq_muddati }))),
      );
    }
    case 'suggest_assignee':
      return deck(
        'Nomzodlar',
        list((data as { nomzodlar?: unknown }).nomzodlar).map((c) => ({ title: s(c.ism) ?? 'Xodim', sub: clip(join(...list(c.sabablar).slice(0, 2).map((x) => s(x))), 120), status: c.tavsiya === true ? 'Tavsiya' : s(c.band), warn: !!c.band })),
      );
    case 'recall':
      return deck(
        'Topilganlar',
        list((data as { topildi?: unknown }).topildi).map((h) => ({ title: s(h.joy) ?? 'Yozuv', sub: clip(s(h.parcha), 140), time: s(h.sana), status: s(h.manba), href: s(h.havola) })),
      );
    default:
      return null;
  }
}
