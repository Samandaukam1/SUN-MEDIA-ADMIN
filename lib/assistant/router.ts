import { normalize } from './intents';

/**
 * Sunny's deterministic commands (§23, layer 2): short, unambiguous requests go straight to the system's own tools —
 * no AI call, so they are instant, free and work even when the free AI is overloaded. The tools are the same ones the
 * AI uses: permissions, server time, verification and confirmation rules are exactly the same. Anything that is not an
 * exact command returns null and goes to the AI as before. Pure functions (matching and wording).
 */

export type Route = { tool: 'check_in' | 'my_tasks' | 'upcoming_shootings'; input: Record<string, unknown> } | { link: { href: string; label: string } };

/** Panel pages by the words people use for them (only a link: the page itself checks access). */
const PAGES: [RegExp, string, string][] = [
  [/^(chat|chatlar)$/, '/chat', 'Chat'],
  [/^vazifa(lar)?$/, '/work/tasks', 'Vazifalar'],
  [/^davomat$/, '/team/attendance', 'Davomat'],
  [/^mijoz(lar)?$/, '/clients', 'Mijozlar'],
  [/^kontent( reja(si)?)?$/, '/work/content', 'Kontent'],
  [/^(kalendar|kalendarь|taqvim)$/, '/work/calendar', 'Kalendar'],
  [/^syomka(lar)?$/, '/work/shootings', 'S’yomkalar'],
  [/^crm$/, '/crm', 'CRM'],
  [/^hisobot(lar)?$/, '/reports', 'Hisobotlar'],
  [/^sozlama(lar)?$/, '/settings', 'Sozlamalar'],
  [/^(bosh sahifa|panel)$/, '/panel', 'Bosh sahifa'],
];

/** The command in a short message, or null. Only for signed-in people (`staff` / `client`); attendance is staff only. */
export function routeCommand(text: string, audience: 'public' | 'staff' | 'client'): Route | null {
  if (audience === 'public') return null;
  const t = normalize(text)
    .replace(/ ?iltimos$/u, '')
    .replace(/(gin|ing|ng)$/u, '')
    .trim();
  if (!t || t.split(' ').length > 6) return null;
  if (audience === 'staff' && /^(men )?(keldim|ishga keldim|keldimni (belgila|bos|qayd qil)|davomat(im)?(ni)? belgila|kelganimni belgila)$/u.test(t)) {
    return { tool: 'check_in', input: {} };
  }
  if (/^(muddati otgan|kechikkan) vazifalarim$/u.test(t)) return { tool: 'my_tasks', input: { overdue_only: true } };
  if (/^((bugungi|mening|meni) )?vazifalarim( (qanday|bor|nima|qani))?$|^vazifalarimni (korsat|ayt)$|^menda qanday vazifalar bor$/u.test(t)) return { tool: 'my_tasks', input: {} };
  if (/^((yaqin|keyingi|bu haftagi|yaqindagi) )?syomkalar( (qachon|qanday|bor))?$|^qachon syomka bor$/u.test(t)) return { tool: 'upcoming_shootings', input: {} };
  if (audience === 'staff') {
    const m = /^(.+?) (sahifasini |sahifasi |boʻlimini |bolimini )?(och|ochib ber|ochgin|korsat)$/u.exec(t);
    if (m) for (const [re, href, label] of PAGES) if (re.test(m[1])) return { link: { href, label } };
  }
  return null;
}

const STATUS: Record<string, string> = { todo: 'boshlanmagan', in_progress: 'jarayonda', in_review: 'tekshiruvda', revision: 'qayta ishlashda', scheduled: 'rejalangan', confirmed: 'tasdiqlangan' };

/** An action tool's own outcome, as the person reads it (the tool already wrote it in words). */
export function actionReply(content: string): { text: string; ok: boolean; waiting: boolean } {
  try {
    const r = JSON.parse(content) as { holat?: string; xabar?: string };
    if (r.holat === 'TASDIQ KUTILMOQDA') return { text: `${r.xabar ?? 'Tasdiq kerak.'} Tasdiqlash tugmasini bosing yoki «ha» deng.`, ok: true, waiting: true };
    return { text: r.xabar ?? (r.holat === 'BAJARILDI' ? 'Bajarildi.' : 'Bajarilmadi.'), ok: r.holat === 'BAJARILDI' || r.holat === 'OK', waiting: false };
  } catch {
    return { text: content, ok: false, waiting: false };
  }
}

/** "Sizda 4 ta ochiq vazifa bor (1 tasi muddati o‘tgan): …" — from the my_tasks rows. */
export function tasksReply(content: string, overdueOnly = false): string {
  let rows: { vazifa: string; holat: string; muddat?: string | null; muddati_otgan?: boolean; mijoz?: string | null }[];
  try {
    rows = JSON.parse(content);
  } catch {
    return content;
  }
  if (!Array.isArray(rows) || !rows.length) return overdueOnly ? 'Muddati o‘tgan vazifangiz yo‘q.' : 'Ochiq vazifangiz yo‘q.';
  const late = rows.filter((r) => r.muddati_otgan).length;
  const head = overdueOnly
    ? `Muddati o‘tgan ${rows.length} ta vazifangiz bor:`
    : `Sizda ${rows.length} ta ochiq vazifa bor${late ? ` (${late} tasi muddati o‘tgan)` : ''}:`;
  const list = rows.slice(0, 8).map((r, i) => `${i + 1}. ${r.vazifa}${r.mijoz ? ` — ${r.mijoz}` : ''}${r.muddat ? `, muddat ${r.muddat}` : ''}${r.muddati_otgan ? ' ⚠️' : ''} (${STATUS[r.holat] ?? r.holat})`);
  return [head, ...list, rows.length > 8 ? `…yana ${rows.length - 8} ta — [Vazifalar](/work/tasks)` : ''].filter(Boolean).join('\n');
}

/** Upcoming shootings, from the upcoming_shootings rows. */
export function shootingsReply(content: string): string {
  let rows: { syomka: string; holat: string; boshlanishi: string; joy?: string | null; mijoz?: string | null }[];
  try {
    rows = JSON.parse(content);
  } catch {
    return content;
  }
  if (!Array.isArray(rows) || !rows.length) return 'Yaqin ikki haftada s’yomka yo‘q.';
  const list = rows.slice(0, 8).map((r, i) => `${i + 1}. ${r.boshlanishi} — ${r.syomka}${r.mijoz ? ` (${r.mijoz})` : ''}${r.joy ? `, ${r.joy}` : ''}`);
  return [`Yaqin s’yomkalar — ${rows.length} ta:`, ...list].join('\n');
}
