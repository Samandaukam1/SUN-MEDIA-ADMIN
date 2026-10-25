import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/site/normalize';
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

export function toolsFor(audience: AssistantAudience): ToolDef[] {
  if (audience === 'public') return PUBLIC_TOOLS;
  if (audience === 'client') return WORK_TOOLS.filter((t) => t.name !== 'my_tasks').concat(PUBLIC_TOOLS.filter((t) => t.name === 'show_link'));
  return WORK_TOOLS;
}

const SAFE_PATH = /^\/[A-Za-z0-9/_-]*(#[A-Za-z0-9_-]+)?$/;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const json = (value: unknown) => JSON.stringify(value).slice(0, 12_000);

export async function runTool(name: string, input: Record<string, unknown>, ctx: AssistantContext): Promise<ToolResult> {
  const allowed = toolsFor(ctx.audience).some((t) => t.name === name);
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
