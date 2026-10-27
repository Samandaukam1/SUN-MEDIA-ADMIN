/**
 * Predictive intelligence (§31): delays that are likely, found by plain rules over the system's own data — a deadline
 * close while the task has not started, a shooting close while its script is not approved or its equipment not
 * prepared, one person booked on two shootings at once, an editing backlog, a client approval that is late for the
 * post. Each risk says which rule found it, so nobody mistakes a forecast for a fact. Pure functions.
 */

export type RiskTask = { id: string; title: string; status: string; due_at: string | null; task_type: string; client: string | null; assignees: string[] };
export type RiskContent = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  post_at: string | null;
  client_approval_due_at: string | null;
  status_changed_at: string;
  client: string | null;
  shooting_id: string | null;
  equipment_total: number;
  equipment_ready: number;
};
export type RiskShooting = { id: string; title: string; status: string; starts_at: string; ends_at: string; client: string | null; members: { id: string; name: string }[] };
export type Snapshot = { tasks: RiskTask[]; content: RiskContent[]; shootings: RiskShooting[] };

export type Risk = {
  tur: string;
  daraja: 'yuqori' | 'o‘rta';
  nima: string;
  /** The rule that found it (why this is a risk, not a fact). */
  qoida: string;
  tavsiya: string;
  /** When it matters (ISO), for ordering. */
  vaqt: string | null;
  havola?: string;
};

const H = 3_600_000;
const D = 24 * H;
const TZ = 'Asia/Tashkent';
const whenFmt = new Intl.DateTimeFormat('uz-UZ', { timeZone: TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
const when = (iso: string) => whenFmt.format(new Date(iso));
const of = (client: string | null) => (client ? ` (${client})` : '');
const left = (iso: string, now: number) => {
  const h = Math.max(0, Math.round((new Date(iso).getTime() - now) / H));
  return h < 24 ? `${h} soat` : `${Math.round(h / 24)} kun`;
};

const OPEN_TASK = new Set(['todo', 'in_progress', 'in_review', 'revision']);
const DONE_CONTENT = new Set(['approved', 'scheduled', 'published', 'cancelled']);
const ACTIVE_SHOOT = new Set(['planned', 'confirmed', 'in_progress']);

export function assessRisks(s: Snapshot, nowDate = new Date()): Risk[] {
  const now = nowDate.getTime();
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
  const within = (iso: string | null, ms: number) => {
    const v = t(iso);
    return v > now && v - now <= ms;
  };
  const risks: Risk[] = [];
  const shootById = new Map(s.shootings.map((x) => [x.id, x]));

  // 1. A deadline close, the task not started (or nobody on it).
  for (const task of s.tasks) {
    if (!OPEN_TASK.has(task.status) || !task.due_at) continue;
    if (!task.assignees.length && within(task.due_at, 3 * D)) {
      risks.push({
        tur: 'mas’ul yo‘q',
        daraja: 'yuqori',
        nima: `“${task.title}”${of(task.client)} — muddatga ${left(task.due_at, now)} qoldi, mas’ul biriktirilmagan`,
        qoida: 'Muddatga 3 kundan kam qolgan vazifada mas’ul yo‘q.',
        tavsiya: 'Mas’ul tayinlang (kimga berishni so‘rasangiz, tavsiya beraman).',
        vaqt: task.due_at,
        havola: `/work/tasks/${task.id}`,
      });
    } else if (task.status === 'todo' && within(task.due_at, 2 * D)) {
      risks.push({
        tur: 'muddat yaqin, boshlanmagan',
        daraja: within(task.due_at, D) ? 'yuqori' : 'o‘rta',
        nima: `“${task.title}”${of(task.client)} — muddatga ${left(task.due_at, now)} qoldi, hali boshlanmagan (${task.assignees.join(', ')})`,
        qoida: 'Muddatga 48 soatdan kam qolgan, vazifa hali "Navbatda".',
        tavsiya: `${task.assignees[0] ?? 'Mas’ul'} bilan bugun boshlashni kelishing yoki muddatni oldindan ko‘chiring.`,
        vaqt: task.due_at,
        havola: `/work/tasks/${task.id}`,
      });
    }
  }

  for (const c of s.content) {
    if (DONE_CONTENT.has(c.status)) continue;
    const shoot = c.shooting_id ? shootById.get(c.shooting_id) : undefined;
    const shootSoon = shoot && ACTIVE_SHOOT.has(shoot.status) && within(shoot.starts_at, 3 * D) ? shoot : undefined;

    // 2. The script is not approved, but its shooting (or the post) is close.
    if (c.status === 'idea' || c.status === 'script') {
      if (shootSoon) {
        risks.push({
          tur: 'ssenariy tasdiqlanmagan',
          daraja: within(shootSoon.starts_at, D) ? 'yuqori' : 'o‘rta',
          nima: `“${c.title}”${of(c.client)} — s’yomka ${when(shootSoon.starts_at)}, lekin ssenariy hali tasdiqlanmagan`,
          qoida: 'S’yomkaga 3 kundan kam qolgan, kontent hali g‘oya/ssenariy bosqichida.',
          tavsiya: 'Ssenariyni bugun tasdiqlating, aks holda s’yomkani ko‘chirishni o‘ylang.',
          vaqt: shootSoon.starts_at,
          havola: `/work/content/${c.id}`,
        });
      } else if (within(c.post_at, 5 * D)) {
        risks.push({
          tur: 'ssenariy tasdiqlanmagan',
          daraja: within(c.post_at, 2 * D) ? 'yuqori' : 'o‘rta',
          nima: `“${c.title}”${of(c.client)} — post ${when(c.post_at!)}, lekin ssenariy hali tasdiqlanmagan`,
          qoida: 'Postga 5 kundan kam qolgan, kontent hali g‘oya/ssenariy bosqichida.',
          tavsiya: 'Ssenariy va s’yomka vaqtini bugun belgilang yoki post sanasini ko‘chiring.',
          vaqt: c.post_at,
          havola: `/work/content/${c.id}`,
        });
      }
    }

    // 3. Equipment not prepared for a close shooting.
    if (shoot && ACTIVE_SHOOT.has(shoot.status) && within(shoot.starts_at, 2 * D) && c.equipment_total > c.equipment_ready) {
      risks.push({
        tur: 'jihoz tayyor emas',
        daraja: within(shoot.starts_at, D) ? 'yuqori' : 'o‘rta',
        nima: `“${c.title}”${of(c.client)} — s’yomka ${when(shoot.starts_at)}, jihozlar ${c.equipment_ready}/${c.equipment_total} tayyor`,
        qoida: 'S’yomkaga 48 soatdan kam qolgan, kontentga biriktirilgan jihozlar hali tayyorlanmagan.',
        tavsiya: 'Jihozlarni bugun tayyorlab belgilang (S’yomka jihozlari bo‘limi).',
        vaqt: shoot.starts_at,
        havola: '/work/jihozlar',
      });
    }

    // 4. Shot days ago, editing not started.
    const stale = Math.floor((now - t(c.status_changed_at)) / D);
    if (c.status === 'shot' && stale >= 3) {
      risks.push({
        tur: 'montaj navbati',
        daraja: stale >= 6 || within(c.post_at, 3 * D) ? 'yuqori' : 'o‘rta',
        nima: `“${c.title}”${of(c.client)} — s’yomka tugaganiga ${stale} kun, montaj hali boshlanmagan`,
        qoida: 'Kontent 3 kundan ortiq "S’yomka tugadi" bosqichida turibdi.',
        tavsiya: 'Montajchi biriktiring yoki navbatini oldinga suring.',
        vaqt: c.post_at,
        havola: `/work/content/${c.id}`,
      });
    }

    // 5. The client's approval is late, or the post is close and still unapproved.
    if (c.status === 'client_review') {
      if (c.client_approval_due_at && t(c.client_approval_due_at) < now) {
        risks.push({
          tur: 'mijoz tasdig‘i kechikmoqda',
          daraja: 'yuqori',
          nima: `“${c.title}”${of(c.client)} — mijoz tasdig‘i muddati (${when(c.client_approval_due_at)}) o‘tdi`,
          qoida: 'Mijoz tasdiqlash muddati o‘tgan, kontent hali mijoz tekshiruvida.',
          tavsiya: 'Mijozga eslatma yuboring yoki menejer qo‘ng‘iroq qilsin.',
          vaqt: c.client_approval_due_at,
          havola: `/work/content/${c.id}`,
        });
      } else if (within(c.post_at, 2 * D)) {
        risks.push({
          tur: 'mijoz tasdig‘i kechikmoqda',
          daraja: 'yuqori',
          nima: `“${c.title}”${of(c.client)} — post ${when(c.post_at!)}, mijoz hali tasdiqlamagan`,
          qoida: 'Postga 48 soatdan kam qolgan, kontent mijoz tekshiruvida.',
          tavsiya: 'Mijozdan bugun tasdiq so‘rang.',
          vaqt: c.post_at,
          havola: `/work/content/${c.id}`,
        });
      }
    } else if (within(c.post_at, D) && c.status === 'internal_review') {
      // 6. A post within a day, still waiting for the agency's own approval (and the client's after it).
      risks.push({
        tur: 'tasdiq kechikmoqda',
        daraja: 'yuqori',
        nima: `“${c.title}”${of(c.client)} — post ${when(c.post_at!)}, kontent hali ichki tekshiruvda`,
        qoida: 'Postga 24 soatdan kam qolgan, ichki tasdiq (keyin mijoz tasdig‘i) hali yo‘q.',
        tavsiya: 'Ichki tekshiruvni bugun yakunlang va mijozga yuboring, yoki post vaqtini ko‘chiring.',
        vaqt: c.post_at,
        havola: `/work/content/${c.id}`,
      });
    } else if (within(c.post_at, D)) {
      // 7. A post within a day that is not even in review yet.
      risks.push({
        tur: 'post tayyor emas',
        daraja: 'yuqori',
        nima: `“${c.title}”${of(c.client)} — post ${when(c.post_at!)}, kontent hali tayyor emas`,
        qoida: 'Postga 24 soatdan kam qolgan, kontent tekshiruvga ham yetmagan.',
        tavsiya: 'Post vaqtini ko‘chiring yoki ishni bugun tekshiruvga chiqaring.',
        vaqt: c.post_at,
        havola: `/work/content/${c.id}`,
      });
    }
  }

  // 8. One person on two shootings at the same time.
  const active = s.shootings.filter((x) => ACTIVE_SHOOT.has(x.status) && t(x.ends_at) > now && t(x.starts_at) - now <= 7 * D);
  const seen = new Set<string>();
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (!(t(a.starts_at) < t(b.ends_at) && t(b.starts_at) < t(a.ends_at))) continue;
      for (const m of a.members) {
        if (!b.members.some((x) => x.id === m.id) || seen.has(`${m.id}:${a.id}:${b.id}`)) continue;
        seen.add(`${m.id}:${a.id}:${b.id}`);
        risks.push({
          tur: 's’yomkalar to‘qnashuvi',
          daraja: 'yuqori',
          nima: `${m.name} bir vaqtda ikki s’yomkada: “${a.title}”${of(a.client)} va “${b.title}”${of(b.client)} (${when(a.starts_at)})`,
          qoida: 'Bir xodim vaqti ustma-ust tushgan ikki s’yomkaga biriktirilgan.',
          tavsiya: 'Birida boshqa xodimni biriktiring yoki vaqtni o‘zgartiring.',
          vaqt: a.starts_at,
          havola: '/work/shootings',
        });
      }
    }
  }

  // 9. Too much editing on one person.
  const editing = new Map<string, number>();
  for (const task of s.tasks) if (task.task_type === 'editing' && OPEN_TASK.has(task.status)) for (const p of task.assignees) editing.set(p, (editing.get(p) ?? 0) + 1);
  for (const [person, n] of editing) {
    if (n < 4) continue;
    risks.push({
      tur: 'montaj navbati',
      daraja: n >= 6 ? 'yuqori' : 'o‘rta',
      nima: `${person}da ${n} ta ochiq montaj vazifasi`,
      qoida: 'Bir xodimda 4 tadan ortiq ochiq montaj vazifasi.',
      tavsiya: 'Bir qismini boshqa montajchiga bering (kimga berishni so‘rasangiz, tavsiya beraman).',
      vaqt: null,
      havola: '/work/tasks',
    });
  }

  const rank = (r: Risk) => (r.daraja === 'yuqori' ? 0 : 1);
  return risks.sort((a, b) => rank(a) - rank(b) || (t(a.vaqt) || Infinity) - (t(b.vaqt) || Infinity)).slice(0, 20);
}
