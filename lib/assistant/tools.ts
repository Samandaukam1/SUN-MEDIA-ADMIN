import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { commandCenterSchema } from '@/lib/schemas/command-center';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/site/normalize';
import { agencyDateKey, formatTime } from '@/lib/time';
import type { Database } from '@/types/database';

/** Who is talking to the assistant. Public visitors get sales tools; signed-in people get read-only work tools (RLS). */
export type AssistantAudience = 'public' | 'staff' | 'client';

export type AssistantContext = {
  audience: AssistantAudience;
  /** The visitor's own Supabase session (RLS); null for public visitors. */
  db: SupabaseClient<Database> | null;
  userId: string | null;
  /** One-way IP key used by site_apply's rate limit; null when the server secret is missing. */
  visitorKey: string | null;
  userAgent: string;
  /** The signed-in person's permissions (which internal tools are offered); the database checks them again. */
  permissions: string[];
  owner: boolean;
};

/** Something the widget does after the reply (show a button, mark the lead as sent). */
export type AssistantAction = { type: 'lead_created' } | { type: 'link'; href: string; label: string } | { type: 'open_apply' };

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
type ToolResult = { content: string; action?: AssistantAction };

const str = (description: string) => ({ type: 'string', description });

const PUBLIC_TOOLS: ToolDef[] = [
  {
    name: 'create_lead',
    description:
      'Mijozning arizasini SUN MEDIA CRM’iga yuboradi (menejerlar darhol bildirishnoma oladi). Faqat mijoz rozi bo‘lganda va barcha maydonlar ' +
      'aniq bo‘lganda chaqiring: ism, familiya, brend nomi, telefon, Instagram yoki Telegram (kamida bittasi) va taxminiy oylik byudjet (so‘mda).',
    input_schema: {
      type: 'object',
      properties: {
        first_name: str('Ism'),
        last_name: str('Familiya'),
        brand: str('Brend yoki kompaniya nomi'),
        phone: str('Telefon, masalan +998901234567 yoki 901234567'),
        instagram: str('Instagram username (@ siz), bo‘lmasa bo‘sh'),
        telegram: str('Telegram username (@ siz), bo‘lmasa bo‘sh'),
        budget_amount: { type: 'number', description: 'Taxminiy byudjet, so‘mda (masalan 5000000)' },
        budget_label: str('Tanlangan tarif nomi yoki byudjet izohi, ixtiyoriy'),
        interest: str('Qaysi xizmat qiziqtiradi (qisqa)'),
      },
      required: ['first_name', 'last_name', 'brand', 'phone', 'budget_amount'],
    },
  },
  {
    name: 'show_link',
    description: 'Javob ostida sayt sahifasiga tugma ko‘rsatadi (masalan /tariflar, /keyslar/<slug>, /aloqa). Faqat bilimlar bazasidagi manzillar.',
    input_schema: {
      type: 'object',
      properties: { href: str('Sayt ichidagi manzil, / bilan boshlanadi'), label: str('Tugma matni, 1–4 so‘z') },
      required: ['href', 'label'],
    },
  },
  {
    name: 'open_application_form',
    description: 'Mijoz o‘zi forma to‘ldirishni afzal ko‘rsa, saytdagi “Ariza qoldirish” oynasini ochadi.',
    input_schema: { type: 'object', properties: {} },
  },
];

const WORK_TOOLS: ToolDef[] = [
  {
    name: 'my_tasks',
    description: 'Foydalanuvchiga biriktirilgan ochiq vazifalar (muddat bo‘yicha). Xodimlar uchun.',
    input_schema: {
      type: 'object',
      properties: { overdue_only: { type: 'boolean', description: 'Faqat muddati o‘tganlar' } },
    },
  },
  {
    name: 'upcoming_shootings',
    description: 'Yaqin kunlardagi s’yomkalar (foydalanuvchi ko‘ra oladiganlari).',
    input_schema: { type: 'object', properties: { days: { type: 'number', description: 'Necha kun oldinga, standart 14' } } },
  },
  {
    name: 'content_status',
    description: 'Kontent (post, video, reels) holatlari: joriy oy rejasi. Mijozlar o‘z loyihasi holatini so‘raganda ham shu.',
    input_schema: { type: 'object', properties: { client_name: str('Mijoz nomi bo‘yicha filtr, ixtiyoriy') } },
  },
  {
    name: 'projects',
    description: 'Faol loyihalar va ularning holati.',
    input_schema: { type: 'object', properties: {} },
  },
];

const dayParam = { type: 'string', description: 'Sana YYYY-MM-DD (Toshkent vaqti); bo‘sh bo‘lsa — bugun. "Kecha" uchun bugungi sanadan bir kun oldin.' };

/** The internal system, each tool behind the permission the matching panel page needs (the database checks it too). */
const STAFF_TOOLS: (ToolDef & { needs?: string[] })[] = [
  {
    name: 'team',
    description:
      'Jamoa: har bir xodim — lavozimi, bo‘limi, bugungi davomat holati (keldi/kechikdi/kelmadi…), kechikish daqiqasi, ochiq va muddati o‘tgan vazifalari, bugun muddati tugaydiganlari, bugungi s’yomkalari. Ism bo‘yicha filtr mumkin.',
    input_schema: { type: 'object', properties: { name: str('Xodim ismi (qisman), ixtiyoriy') } },
  },
  {
    name: 'attendance',
    needs: ['attendance.read', 'attendance.manage'],
    description:
      'Kun bo‘yicha davomat: kim keldi (kelgan vaqti), kim kechikdi (necha daqiqa), kim kelmadi, kim sababli/ta’tilda/masofadan, kim hali belgilanmagan, ochiq davomat ogohlantirishlari. "Bugun kimlar keldi/kelmadi" savollari uchun.',
    input_schema: { type: 'object', properties: { date: dayParam } },
  },
  {
    name: 'overview',
    needs: ['dashboard.view'],
    description:
      'Agentlikning kunlik holati (panel bosh sahifasi): vazifalar soni va holati, muddati o‘tgan vazifalar (kimda), yaqin va xavfli muddatlar, tasdiq kutayotgan kontent, rejalashtirilgan va chiqqan postlar, kunning s’yomkalari, davomat xulosasi.',
    input_schema: { type: 'object', properties: { date: dayParam } },
  },
  {
    name: 'issues',
    needs: ['dashboard.view'],
    description:
      'Kamchiliklar va xavflar ro‘yxati: muddati o‘tgan vazifalar (kimda, necha kun), xavfli muddatlar, 48 soatdan ortiq tasdiq kutayotgan kontent, kechikkan/kelmagan/belgilanmagan xodimlar, ochiq davomat ogohlantirishlari, javobsiz sayt arizalari. "Nima kamchilik bor", "muammolar" savollari uchun.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'crm',
    needs: ['crm.read'],
    description: 'CRM: lidlar xulosasi (holatlar, mijozlar bo‘yicha, oxirgi kunlar) va saytdan kelgan yangi arizalar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'performance',
    needs: ['performance.read'],
    description: 'Xodimlar samaradorligi (KPI): tanlangan davrda har bir xodimning ko‘rsatkichlari. Standart — joriy oy boshidan bugungacha.',
    input_schema: { type: 'object', properties: { from: str('Boshlanish sanasi YYYY-MM-DD, ixtiyoriy'), to: str('Tugash sanasi YYYY-MM-DD, ixtiyoriy') } },
  },
  {
    name: 'search',
    description: 'Tizim bo‘yicha qidiruv: mijoz, vazifa, kontent, loyiha, xodim nomi bo‘yicha topadi.',
    input_schema: { type: 'object', properties: { query: str('Qidiruv so‘zi') }, required: ['query'] },
  },
];

export function toolsFor(ctx: Pick<AssistantContext, 'audience' | 'permissions' | 'owner'>): ToolDef[] {
  if (ctx.audience === 'public') return PUBLIC_TOOLS;
  const link = PUBLIC_TOOLS.filter((t) => t.name === 'show_link');
  if (ctx.audience === 'client') return WORK_TOOLS.filter((t) => t.name !== 'my_tasks').concat(link);
  const allowed = (t: { needs?: string[] }) => !t.needs || ctx.owner || t.needs.some((p) => ctx.permissions.includes(p));
  return [...STAFF_TOOLS.filter(allowed).map(({ name, description, input_schema }) => ({ name, description, input_schema })), ...WORK_TOOLS, ...link];
}

const SAFE_PATH = /^\/[A-Za-z0-9/_-]*(#[A-Za-z0-9_-]+)?$/;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const json = (value: unknown) => JSON.stringify(value).slice(0, 14_000);
const dateArg = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : agencyDateKey());
/** "09:12:00" (time) or an ISO timestamp → "09:12" in Tashkent. */
const clock = (v: string | null | undefined) => (!v ? null : /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : formatTime(v));
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
/** A database refusal (no permission) is said plainly; anything else is a read error. */
const refused = (error: { message?: string; code?: string }) =>
  /permission|forbidden|not allowed|denied|PERMISSION|FORBIDDEN|42501/i.test(`${error.message} ${error.code}`)
    ? 'Bu ma’lumot sizning rolingizga ochiq emas.'
    : 'Ma’lumotni o‘qib bo‘lmadi.';
const STATUS_UZ: Record<string, string> = { present: 'keldi', late: 'kechikdi', absent: 'kelmadi', excused: 'sababli', vacation: 'ta’tilda', remote: 'masofadan' };

type AttendanceRow = Database['public']['Functions']['get_attendance_day']['Returns'][number];

/** One day's attendance grouped the way people ask about it. */
async function attendanceDay(db: SupabaseClient<Database>, date: string) {
  const { data, error } = await db.rpc('get_attendance_day', { p_date: date });
  if (error) return { error: refused(error) };
  const rows = (data as AttendanceRow[]).filter((r) => r.scheduled || r.status);
  const person = (r: AttendanceRow) => ({
    ism: r.full_name,
    lavozim: r.job_title || null,
    keldi: clock(r.arrived_at) ?? clock(r.checked_in_at),
    ...(r.late_minutes ? { kechikish_daqiqa: r.late_minutes } : {}),
    ...(r.note ? { izoh: r.note } : {}),
  });
  const by = (status: string) => rows.filter((r) => r.status === status).map(person);
  const { data: alerts } = await db.from('attendance_alerts').select('note, attendance_id').eq('status', 'open').eq('work_date', date);
  const nameOf = new Map(rows.map((r) => [r.attendance_id, r.full_name]));
  return {
    sana: date,
    ishchi_kuni_bor: rows.filter((r) => r.scheduled).length,
    keldi: by('present'),
    kechikdi: by('late'),
    kelmadi: by('absent'),
    sababli: by('excused'),
    tatilda: by('vacation'),
    masofadan: by('remote'),
    hali_belgilanmagan: rows.filter((r) => r.scheduled && !r.status).map((r) => ({ ism: r.full_name, lavozim: r.job_title || null, ish_boshlanishi: clock(r.work_start_time) })),
    ochiq_ogohlantirishlar: (alerts ?? []).map((a) => ({ xodim: (a.attendance_id && nameOf.get(a.attendance_id)) || null, izoh: a.note })),
  };
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: AssistantContext): Promise<ToolResult> {
  const allowed = toolsFor(ctx).some((t) => t.name === name);
  if (!allowed) return { content: 'Bu amal sizga ochiq emas.' };
  const text = (key: string) => String(input[key] ?? '').trim();

  switch (name) {
    case 'create_lead': {
      if (!ctx.visitorKey) return { content: 'Ariza qabul qilish hozir ishlamayapti — mijozga telefon raqamimizni bering.' };
      const phone = normalizePhone(text('phone'));
      const handle = (v: string) => v.replace(/^https?:\/\/(www\.)?(instagram\.com|t\.me|telegram\.me)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
      const instagram = handle(text('instagram'));
      const telegram = handle(text('telegram'));
      const budget = Number(input.budget_amount);
      const problems: string[] = [];
      if (text('first_name').length < 2) problems.push('ism');
      if (text('last_name').length < 2) problems.push('familiya');
      if (!text('brand')) problems.push('brend nomi');
      if (!/^\+[0-9]{9,15}$/.test(phone)) problems.push('to‘liq telefon raqami');
      if (!instagram && !telegram) problems.push('Instagram yoki Telegram username');
      if (!Number.isFinite(budget) || budget <= 0) problems.push('taxminiy byudjet');
      if (problems.length) return { content: `Ariza yuborilmadi. Yetishmayapti: ${problems.join(', ')}. Mijozdan so‘rang.` };
      const label = [text('budget_label'), text('interest') && `Qiziqish: ${text('interest')}`, 'AI yordamchi orqali'].filter(Boolean).join(' · ');
      const { error } = await createAdminClient().rpc('site_apply', {
        p_first_name: text('first_name').slice(0, 60),
        p_last_name: text('last_name').slice(0, 60),
        p_brand: text('brand').slice(0, 120),
        p_phone: phone,
        p_instagram: instagram.slice(0, 30),
        p_telegram: telegram.slice(0, 32),
        p_budget_amount: budget,
        p_budget_label: label.slice(0, 120),
        p_source_path: '/yordamchi',
        p_fingerprint: ctx.visitorKey,
        p_user_agent: ctx.userAgent,
      });
      if (error) {
        if (error.message === 'SITE_RATE_LIMITED') return { content: 'Bu mijoz yaqinda ariza yuborgan — qayta yuborish shart emas, menejer bog‘lanadi.' };
        return { content: 'Arizani saqlab bo‘lmadi. Mijozga telefon raqamimizni bering.' };
      }
      return { content: 'Ariza CRM’ga tushdi. Menejer tez orada bog‘lanadi.', action: { type: 'lead_created' } };
    }

    case 'show_link': {
      const href = text('href');
      if (!SAFE_PATH.test(href)) return { content: 'Manzil noto‘g‘ri.' };
      return { content: 'Tugma ko‘rsatildi.', action: { type: 'link', href, label: text('label').slice(0, 40) || 'Ochish' } };
    }

    case 'open_application_form':
      return { content: 'Forma ochildi.', action: { type: 'open_apply' } };
  }

  const db = ctx.db;
  if (!db || !ctx.userId) return { content: 'Avval tizimga kiring.' };

  switch (name) {
    case 'my_tasks': {
      let q = db
        .from('tasks')
        .select('title, status, priority, due_at, client:clients(name), mine:task_assignments!inner(user_id)')
        .eq('mine.user_id', ctx.userId)
        .is('deleted_at', null)
        .in('status', ['todo', 'in_progress', 'in_review', 'revision'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(25);
      if (input.overdue_only) q = q.lt('due_at', new Date().toISOString());
      const { data, error } = await q;
      if (error) return { content: 'Vazifalarni o‘qib bo‘lmadi.' };
      const rows = (data as unknown as { title: string; status: string; priority: string; due_at: string | null; client: { name: string } | null }[]).map((t) => ({
        vazifa: t.title,
        holat: t.status,
        muhimlik: t.priority,
        muddat: day(t.due_at),
        muddati_otgan: !!t.due_at && new Date(t.due_at) < new Date(),
        mijoz: t.client?.name ?? null,
      }));
      return { content: rows.length ? json(rows) : 'Ochiq vazifa yo‘q.' };
    }
    case 'upcoming_shootings': {
      const days = Math.min(Math.max(Number(input.days) || 14, 1), 60);
      const until = new Date(Date.now() + days * 86_400_000).toISOString();
      const { data, error } = await db
        .from('shootings')
        .select('title, status, starts_at, ends_at, location_name, location_address, client:clients(name)')
        .is('deleted_at', null)
        .gte('ends_at', new Date().toISOString())
        .lte('starts_at', until)
        .not('status', 'in', '(cancelled,completed)')
        .order('starts_at')
        .limit(20);
      if (error) return { content: 'S’yomkalarni o‘qib bo‘lmadi.' };
      const rows = (data as unknown as { title: string; status: string; starts_at: string; location_name: string | null; location_address: string | null; client: { name: string } | null }[]).map((s) => ({
        syomka: s.title,
        holat: s.status,
        boshlanishi: day(s.starts_at),
        joy: s.location_name || s.location_address,
        mijoz: s.client?.name ?? null,
      }));
      return { content: rows.length ? json(rows) : `Keyingi ${days} kunda s’yomka yo‘q.` };
    }
    case 'content_status': {
      const month = new Date().toISOString().slice(0, 7) + '-01';
      const { data, error } = await db
        .from('content_items')
        .select('title, content_type, status, post_at, due_at, client:clients(name)')
        .is('deleted_at', null)
        .gte('plan_month', month)
        .order('post_at', { ascending: true, nullsFirst: false })
        .limit(60);
      if (error) return { content: 'Kontent rejasini o‘qib bo‘lmadi.' };
      const filter = text('client_name').toLowerCase();
      const rows = (data as unknown as { title: string; content_type: string; status: string; post_at: string | null; due_at: string | null; client: { name: string } | null }[])
        .filter((r) => !filter || (r.client?.name ?? '').toLowerCase().includes(filter))
        .map((r) => ({ kontent: r.title, turi: r.content_type, holat: r.status, chiqishi: day(r.post_at), mijoz: r.client?.name ?? null }));
      return { content: rows.length ? json(rows) : 'Bu oy uchun kontent topilmadi.' };
    }
    case 'team': {
      const { data, error } = await db.rpc('get_team_directory');
      if (error) return { content: refused(error) };
      const filter = text('name').toLowerCase();
      const rows = (data ?? [])
        .filter((r) => r.account_status !== 'disabled' && (!filter || r.full_name.toLowerCase().includes(filter)))
        .map((r) => ({
          ism: r.full_name,
          lavozim: r.job_title || null,
          bolim: r.department || null,
          bugun: r.attendance_status ? (STATUS_UZ[r.attendance_status] ?? r.attendance_status) : 'belgilanmagan',
          ...(r.late_minutes ? { kechikish_daqiqa: r.late_minutes } : {}),
          ochiq_vazifa: r.open_tasks,
          muddati_otgan: r.overdue_tasks,
          bugun_muddat: r.due_today,
          bugungi_syomka: r.shootings_today,
        }));
      return { content: rows.length ? json({ xodimlar_soni: rows.length, xodimlar: rows }) : 'Xodim topilmadi.' };
    }
    case 'attendance': {
      const result = await attendanceDay(db, dateArg(input.date));
      return { content: 'error' in result ? result.error! : json(result) };
    }
    case 'overview': {
      const date = dateArg(input.date);
      const { data, error } = await db.rpc('get_command_center', { p_date: date });
      if (error) return { content: refused(error) };
      const cc = commandCenterSchema.safeParse(data);
      if (!cc.success) return { content: 'Ma’lumotni o‘qib bo‘lmadi.' };
      const c = cc.data;
      return {
        content: json({
          sana: date,
          vazifalar: { jami: c.tasks.total, bajarildi: c.tasks.completed, jarayonda: c.tasks.in_progress, boshlanmagan: c.tasks.todo, muddati_otgan: c.tasks.overdue },
          muddati_otgan_vazifalar: c.overdue.slice(0, 15).map((t) => ({ vazifa: t.title, muddat: day(t.due_at), kun_otdi: daysSince(t.due_at), mijoz: t.client_name ?? null, kimda: t.assignees })),
          yaqin_muddatlar: c.deadlines.items.slice(0, 15).map((t) => ({ vazifa: t.title, turi: t.task_type, muddat: day(t.due_at), holat: t.state, mijoz: t.client_name ?? null, kimda: t.assignees.map((a) => a.full_name) })),
          tasdiq_kutmoqda: { mijozda: c.approvals.client_review, ichki: c.approvals.internal_review, royxat: c.approvals.items.slice(0, 12).map((a) => ({ kontent: a.label, holat: a.status, mijoz: a.client_name, kun_kutmoqda: daysSince(a.since) })) },
          postlar: { rejalashtirilgan: c.publications.scheduled, chiqdi: c.publications.published, royxat: c.publications.items.slice(0, 10).map((p) => ({ post: p.label, platforma: p.platform, vaqt: day(p.scheduled_at), holat: p.status, mijoz: p.client_name })) },
          syomkalar: c.shootings.map((s) => ({ syomka: s.title, vaqt: `${day(s.starts_at)}–${clock(s.ends_at)}`, mijoz: s.client_name, joy: s.location_name ?? null, jamoa: s.members.map((m) => `${m.full_name}${m.attendance ? ` (${m.attendance})` : ''}`) })),
          davomat: { xodimlar: c.attendance.employees, keldi: c.attendance.present, kechikdi: c.attendance.late, kelmadi: c.attendance.absent, sababli: c.attendance.excused, tatilda: c.attendance.vacation, masofadan: c.attendance.remote, belgilanmagan: c.attendance.unmarked },
        }),
      };
    }
    case 'issues': {
      const date = agencyDateKey();
      const { data, error } = await db.rpc('get_command_center', { p_date: date });
      if (error) return { content: refused(error) };
      const cc = commandCenterSchema.safeParse(data);
      if (!cc.success) return { content: 'Ma’lumotni o‘qib bo‘lmadi.' };
      const c = cc.data;
      const canAttendance = ctx.owner || ctx.permissions.some((p) => p === 'attendance.read' || p === 'attendance.manage');
      const att = canAttendance ? await attendanceDay(db, date) : null;
      const { data: apps } = await db.from('site_applications').select('full_name, company, created_at').eq('status', 'new').order('created_at').limit(20);
      const stale = (apps ?? []).filter((a) => daysSince(a.created_at) >= 1);
      return {
        content: json({
          sana: date,
          muddati_otgan_vazifalar: { soni: c.tasks.overdue, royxat: c.overdue.slice(0, 15).map((t) => ({ vazifa: t.title, kun_otdi: daysSince(t.due_at), mijoz: t.client_name ?? null, kimda: t.assignees })) },
          xavfli_muddatlar: c.deadlines.items.filter((t) => t.state === 'critical').slice(0, 10).map((t) => ({ vazifa: t.title, muddat: day(t.due_at), mijoz: t.client_name ?? null, kimda: t.assignees.map((a) => a.full_name) })),
          uzoq_tasdiq_kutayotgan: c.approvals.items.filter((a) => daysSince(a.since) >= 2).map((a) => ({ kontent: a.label, kimda: a.status === 'client_review' ? 'mijozda' : 'ichki tekshiruvda', mijoz: a.client_name, kun_kutmoqda: daysSince(a.since) })),
          davomat: att && !('error' in att) ? { kechikdi: att.kechikdi, kelmadi: att.kelmadi, hali_belgilanmagan: att.hali_belgilanmagan, ochiq_ogohlantirishlar: att.ochiq_ogohlantirishlar } : 'Davomat sizning rolingizga ochiq emas.',
          javobsiz_sayt_arizalari: { soni: stale.length, royxat: stale.slice(0, 10).map((a) => ({ ism: a.full_name, kompaniya: a.company, kun_otdi: daysSince(a.created_at) })) },
        }),
      };
    }
    case 'crm': {
      const { data, error } = await db.rpc('get_crm_summary');
      if (error) return { content: refused(error) };
      const { data: apps } = await db.from('site_applications').select('full_name, company, budget_label, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(10);
      return { content: json({ crm: data, yangi_sayt_arizalari: (apps ?? []).map((a) => ({ ism: a.full_name, kompaniya: a.company, byudjet: a.budget_label, qachon: day(a.created_at) })) }) };
    }
    case 'performance': {
      const today = agencyDateKey();
      const from = /^\d{4}-\d{2}-\d{2}$/.test(text('from')) ? text('from') : `${today.slice(0, 8)}01`;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(text('to')) ? text('to') : today;
      const { data, error } = await db.rpc('get_employee_scorecards', { p_from: from, p_to: to });
      if (error) return { content: refused(error) };
      return { content: (data ?? []).length ? json({ davr: `${from} — ${to}`, xodimlar: (data ?? []).map((r) => ({ ism: r.full_name, rollar: r.role_keys, korsatkichlar: r.metrics })) }) : 'Bu davrda ma’lumot yo‘q.' };
    }
    case 'search': {
      const q = text('query');
      if (q.length < 2) return { content: 'Qidiruv uchun kamida 2 harf kerak.' };
      const { data, error } = await db.rpc('global_search', { p_query: q, p_limit: 12 });
      if (error) return { content: refused(error) };
      return { content: json(data ?? []) || 'Hech narsa topilmadi.' };
    }
    case 'projects': {
      const { data, error } = await db
        .from('projects')
        .select('name, kind, status, starts_on, ends_on, client:clients(name)')
        .is('deleted_at', null)
        .in('status', ['planning', 'active', 'on_hold'])
        .order('starts_on', { ascending: false })
        .limit(30);
      if (error) return { content: 'Loyihalarni o‘qib bo‘lmadi.' };
      return { content: data.length ? json(data) : 'Faol loyiha yo‘q.' };
    }
  }
  return { content: 'Noma’lum amal.' };
}
