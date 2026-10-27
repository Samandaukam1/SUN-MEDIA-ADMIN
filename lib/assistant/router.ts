import { normalize } from './intents';

/**
 * Sunny's deterministic commands (§23, layer 2): short, unambiguous requests go straight to the system's own tools —
 * no AI call, so they are instant, free and work even when the free AI is overloaded. The tools are the same ones the
 * AI uses: permissions, server time, verification and confirmation rules are exactly the same. Anything that is not an
 * exact command returns null and goes to the AI as before. Pure functions (matching and wording).
 */

export type Route =
  | { tool: 'check_in' | 'list_tasks' | 'upcoming_shootings' | 'my_memories' | 'risks' | 'my_approvals' | 'partner_status'; input: Record<string, unknown> }
  | { link: { href: string; label: string } };

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
  // Tasks: the staff's own list (clients have no task list of their own: their questions go to the AI).
  if (audience === 'staff') {
    if (/^(muddati otgan|kechikkan) vazifalarim$/u.test(t)) return { tool: 'list_tasks', input: { scope: 'mine', filter: 'overdue' } };
    if (/^bugungi vazifalarim( (qanday|bor|nima|qani))?$/u.test(t)) return { tool: 'list_tasks', input: { scope: 'mine', filter: 'today' } };
    if (/^((mening|meni) )?vazifalarim( (qanday|bor|nima|qani))?$|^vazifalarimni (korsat|ayt)$|^menda qanday vazifalar bor$/u.test(t)) return { tool: 'list_tasks', input: { scope: 'mine', filter: 'open' } };
    if (/^(xotiram|nimalarni eslab qolding|nima eslab qolding|eslab qolganlaring|men haqimda nima bilasan)$/u.test(t)) return { tool: 'my_memories', input: {} };
    if (/^(qanday )?xavflar( bor(mi)?)?$|^xavf bormi$|^nima(lar)? kechikishi mumkin$|^qaysi (ishlar|vazifalar|kontentlar) kechikishi mumkin$|^(nimaga|nimalarga) etibor ber(ay|ish kerak)$/u.test(t)) {
      return { tool: 'risks', input: {} };
    }
  }
  // Partners: their own approvals queue and project status.
  if (audience === 'client') {
    if (
      /^qaysi (post|kontent|video|reels)(lar)? (meni(ng)? )?tasdiq(lash)?(im|imiz)(ni)? kut(yapti|moqda|ayapti)$|^(nimalarni|nimani|qaysilarini) tasdiqlash(im|imiz) kerak$|^tasdiq(imni|imizni)? kutayotgan(lar| (post|kontent|video)lar)$|^tasdiqlash(im|imiz)? kerak bolgan(lar| (post|kontent|video)lar)$/u.test(t)
    ) {
      return { tool: 'my_approvals', input: {} };
    }
    if (/^(bizning )?loyiha(miz)?(ning)? holati( qanday)?$|^(bizning )?(loyihamiz|ishlarimiz|ishlar) qanday$|^loyiha(miz)? (boyicha|haqida) malumot ber$/u.test(t)) return { tool: 'partner_status', input: {} };
  }
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

/** "Sizda 4 ta ochiq vazifa bor (1 tasi muddati o‘tgan): …" — from the list_tasks result (rows in `malumot`). */
export function tasksReply(content: string, filter: 'open' | 'overdue' | 'today' = 'open'): string {
  let rows: { vazifa: string; holat: string; muddat?: string | null; muddati_otgan?: boolean; mijoz?: string | null }[];
  try {
    const parsed = JSON.parse(content) as { holat?: string; xabar?: string; malumot?: unknown } | unknown[];
    if (!Array.isArray(parsed) && parsed.holat === 'BAJARILMADI') return parsed.xabar ?? 'Vazifalarni o‘qib bo‘lmadi.';
    rows = (Array.isArray(parsed) ? parsed : parsed.malumot) as typeof rows;
  } catch {
    return content;
  }
  if (!Array.isArray(rows) || !rows.length) return filter === 'overdue' ? 'Muddati o‘tgan vazifangiz yo‘q.' : filter === 'today' ? 'Bugun muddati tugaydigan vazifangiz yo‘q.' : 'Ochiq vazifangiz yo‘q.';
  const late = rows.filter((r) => r.muddati_otgan).length;
  const head =
    filter === 'overdue'
      ? `Muddati o‘tgan ${rows.length} ta vazifangiz bor:`
      : filter === 'today'
        ? `Bugun ${rows.length} ta vazifangizning muddati:`
        : `Sizda ${rows.length} ta ochiq vazifa bor${late ? ` (${late} tasi muddati o‘tgan)` : ''}:`;
  const list = rows.slice(0, 8).map((r, i) => `${i + 1}. ${r.vazifa}${r.mijoz ? ` — ${r.mijoz}` : ''}${r.muddat ? `, muddat ${r.muddat}` : ''}${r.muddati_otgan ? ' ⚠️' : ''} (${STATUS[r.holat] ?? r.holat})`);
  return [head, ...list, rows.length > 8 ? `…yana ${rows.length - 8} ta — [Vazifalar](/work/tasks)` : ''].filter(Boolean).join('\n');
}

/** The tool's own words and rows ({holat, xabar, malumot}), or null when it is not that shape. */
function outcome<T>(content: string): { failed: string | null; rows: T | undefined; text: string } | null {
  try {
    const r = JSON.parse(content) as { holat?: string; xabar?: string; malumot?: T };
    return { failed: r.holat === 'BAJARILMADI' ? (r.xabar ?? 'Ma’lumotni o‘qib bo‘lmadi.') : null, rows: r.malumot, text: r.xabar ?? '' };
  } catch {
    return null;
  }
}

/** Likely delays (risks): the rule-based forecast, said as a forecast. */
export function risksReply(content: string): string {
  const r = outcome<{ daraja: string; nima: string; tavsiya: string }[]>(content);
  if (!r) return content;
  if (r.failed) return r.failed;
  const rows = r.rows ?? [];
  if (!rows.length) return r.text || 'Hozircha qoidalar bo‘yicha kechikish xavfi ko‘rinmayapti.';
  const high = rows.filter((x) => x.daraja === 'yuqori').length;
  const list = rows.slice(0, 6).map((x, i) => `${i + 1}. ${x.daraja === 'yuqori' ? '(yuqori) ' : ''}${x.nima}. ${x.tavsiya}`);
  return [`Qoidalar bo‘yicha ${rows.length} ta ehtimoliy xavf${high ? `, ${high} tasi yuqori` : ''} (bu taxmin, fakt emas):`, ...list, rows.length > 6 ? `…yana ${rows.length - 6} ta.` : ''].filter(Boolean).join('\n');
}

/** A partner's approval queue. */
export function approvalsReply(content: string): string {
  const r = outcome<{ kontent: string; turi: string; versiya: number; tasdiq_muddati: string | null; post: string | null; muddati_otgan: boolean }[]>(content);
  if (!r) return content;
  if (r.failed) return r.failed;
  const rows = r.rows ?? [];
  if (!rows.length) return 'Hozir tasdiqingizni kutayotgan kontent yo‘q.';
  const list = rows.slice(0, 8).map((x, i) => `${i + 1}. “${x.kontent}” (${x.turi}, ${x.versiya}-versiya)${x.tasdiq_muddati ? ` — tasdiq muddati ${x.tasdiq_muddati}${x.muddati_otgan ? ', muddati o‘tgan' : ''}` : ''}${x.post ? `; post ${x.post}` : ''}`);
  return [`${rows.length} ta kontent tasdiqingizni kutmoqda:`, ...list, 'Ularni Sun Media ilovasidagi «Tasdiqlash» bo‘limida ko‘rib, tasdiqlang yoki izoh qoldiring.'].join('\n');
}

type PartnerView = {
  hamkor: string | null;
  holat: Partial<Record<'ishlab_chiqarishda' | 'montajda' | 'tasdiqingizni_kutmoqda' | 'bugun_chiqadi' | 'shu_oy_chiqdi', number>>;
  kontent: { kontent: string; bosqich: string; post: string | null }[];
  yaqin: { nima: string; nomi: string | null; vaqt: string | null }[];
};

/** A partner's project at a glance. */
export function partnerReply(content: string): string {
  const r = outcome<PartnerView | PartnerView[]>(content);
  if (!r) return content;
  if (r.failed) return r.failed;
  const views = r.rows ? (Array.isArray(r.rows) ? r.rows : [r.rows]) : [];
  if (!views.length) return r.text;
  return views
    .map((v) => {
      const h = v.holat ?? {};
      const counts = [
        h.ishlab_chiqarishda ? `${h.ishlab_chiqarishda} ta kontent ishlab chiqarishda` : '',
        h.montajda ? `${h.montajda} tasi montajda` : '',
        h.tasdiqingizni_kutmoqda ? `${h.tasdiqingizni_kutmoqda} tasi tasdiqingizni kutmoqda` : '',
        h.shu_oy_chiqdi ? `shu oy ${h.shu_oy_chiqdi} ta post chiqdi` : '',
      ].filter(Boolean);
      const work = (v.kontent ?? []).slice(0, 5).map((k) => `“${k.kontent}” — ${k.bosqich}${k.post ? `, post ${k.post}` : ''}`);
      const soon = (v.yaqin ?? []).slice(0, 3).map((e) => `${e.nima}${e.nomi ? ` “${e.nomi}”` : ''} — ${e.vaqt}`);
      return [
        `${v.hamkor ?? 'Loyihangiz'}: ${counts.length ? counts.join(', ') : 'hozir ishlab chiqarishda kontent yo‘q'}.`,
        work.length ? `Kontent: ${work.join('; ')}.` : '',
        soon.length ? `Yaqinda: ${soon.join('; ')}.` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
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
