/**
 * The answers-only part of the report (pure; unit-tested). Everything here is read straight from what the client
 * chose — labelled CONFIRMED with the answer key as evidence — or derived by an explicit rule (INFERRED, with the
 * rule's evidence). It is complete without the AI; the AI analysis is added beside it, never instead of it.
 */

import { answerLabels } from './engine';
import type { Basis, Service } from './guard';
import { industryOf, subOf } from './industries';
import type { AnswerType, AnswerValue, Option, ReqPriority, Stage } from './types';

export type Snapshot = {
  text: string;
  type: AnswerType;
  stage: Stage;
  category: string;
  purpose?: string;
  options: Option[];
  unit?: string;
  source?: string;
};
export type AnswerRecord = { key: string; question: Snapshot; value: AnswerValue };
export type Item = { text: string; basis: Basis; evidence: string[] };
export type Requirement = { id: string; title: string; level: ReqPriority; evidence: string[] };

export type Facts = {
  profile: Record<string, string | null>;
  answers: { key: string; stage: Stage; category: string; question: string; labels: string[]; unknown: boolean; source: string }[];
  goals: Item[];
  problems: Item[];
  marketing: Item[];
  operations: Item[];
  services: { service: Service; reason: string; basis: Basis; evidence: string[] }[];
  notes: Item[];
  website: null | {
    need: string;
    goals: string[];
    must: Requirement[];
    should: Requirement[];
    nice: Requirement[];
    notNeeded: Requirement[];
    unknown: string[];
    details: { key: string; question: string; labels: string[] }[];
    assumptions: string[];
  };
  openQuestions: string[];
};

const get = (records: AnswerRecord[], key: string) => records.find((r) => r.key === key);
const choice = (records: AnswerRecord[], key: string) => get(records, key)?.value.choice ?? [];
const has = (records: AnswerRecord[], key: string, ...values: string[]) => choice(records, key).some((c) => values.includes(c));
const labels = (r: AnswerRecord | undefined) => (r ? answerLabels(r.question, r.question.options, r.value) : []);
const given = (r: AnswerRecord | undefined) => !!r && !r.value.skipped && !r.value.unknown;
const line = (r: AnswerRecord) => `${r.question.text.replace(/\?$/, '')}: ${labels(r).join(', ')}`;
const confirmed = (r: AnswerRecord): Item => ({ text: line(r), basis: 'confirmed', evidence: [r.key] });

const RANK: Record<ReqPriority, number> = { must: 3, should: 2, nice: 1 };

export function buildFacts(records: AnswerRecord[], meta: { industry: string | null; sub: string | null; company?: string | null }): Facts {
  const ind = industryOf(meta.industry);
  const sub = subOf(meta.industry, meta.sub);
  const text = (key: string) => {
    const r = get(records, key);
    return given(r) ? labels(r).join(', ') : null;
  };

  const profile = {
    company: text('id.company') ?? meta.company ?? null,
    industry: ind?.label ?? null,
    sub_industry: sub?.label ?? (get(records, 'id.sub')?.value.other || null),
    offer: text('id.offer') ?? text('mf.products'),
    customers: text('id.customers'),
    role: text('id.role'),
    geography: text('id.geo'),
    model: text('id.model'),
    maturity: text('id.maturity'),
    description: text('id.industry_text'),
  };

  const answers = records.map((r) => ({
    key: r.key,
    stage: r.question.stage,
    category: r.question.category,
    question: r.question.text,
    labels: labels(r),
    unknown: !!r.value.unknown,
    source: r.question.source ?? 'curated',
  }));

  const byCategory = (...cats: string[]) => records.filter((r) => cats.includes(r.question.category) && given(r) && r.question.stage !== 'website').map(confirmed);
  const goals = ['mk.goal', 'id.reason', 'cl.grow', 'dt.grow', 'sa.focus', 'b2.target']
    .map((k) => get(records, k))
    .filter((r): r is AnswerRecord => given(r))
    .map(confirmed);
  const problems = byCategory('Muammolar');
  const marketing = ['mk.channels', 'mk.ads', 'mk.tracking', 'mk.social', 'mk.lead_handling', 'cl.response', 'mk.has_site', 'fd.reviews', 'mk.content', 'mk.budget']
    .map((k) => get(records, k))
    .filter((r): r is AnswerRecord => given(r))
    .map(confirmed);
  const operations = byCategory('Tuzilma', 'Jarayonlar', 'Imkoniyat', 'Sotuv', 'Auditoriya', 'Pozitsiya', 'Xizmatlar', 'Resurslar');

  // ---------------------------------------------------------------- services: explicit rules, each with its evidence
  const services: Facts['services'] = [];
  const add = (service: Service, reason: string, evidence: string[], basis: Basis) => {
    const ev = evidence.filter((k) => get(records, k));
    if (!ev.length) return;
    const existing = services.find((s) => s.service === service);
    if (existing) {
      existing.evidence = [...new Set([...existing.evidence, ...ev])];
      if (basis === 'confirmed') existing.basis = 'confirmed';
      return;
    }
    services.push({ service, reason, basis, evidence: ev });
  };
  if (has(records, 'id.reason', 'smm')) add('SMM', 'Mijoz ijtimoiy tarmoqlarni professional yuritishni o‘zi so‘radi.', ['id.reason'], 'confirmed');
  if (has(records, 'mk.social', 'none', 'self') || has(records, 'mk.challenge', 'no_content'))
    add('SMM', 'Ijtimoiy tarmoqlarni yurituvchi alohida resurs yo‘q yoki kontentga vaqt yetmaydi.', ['mk.social', 'mk.challenge'], 'inferred');
  if (has(records, 'id.reason', 'ads', 'clients')) add('Target reklama', 'Mijoz ko‘proq so‘rov yoki reklama natijasini so‘radi.', ['id.reason'], 'confirmed');
  if (has(records, 'mk.goal', 'more_leads', 'launch') && (has(records, 'mk.ads', 'never', 'past') || has(records, 'mk.challenge', 'few_leads', 'ads_cost')))
    add('Target reklama', 'Ustuvor maqsad — ko‘proq murojaat, hozirgi reklama esa yo‘q yoki samarasiz.', ['mk.goal', 'mk.ads', 'mk.challenge'], 'inferred');
  if (has(records, 'id.reason', 'video')) add('Video kontent', 'Mijoz video va foto kontentni o‘zi so‘radi.', ['id.reason'], 'confirmed');
  if (has(records, 'co.expert', 'yes', 'maybe') || has(records, 'mk.content', 'expert'))
    add('Video kontent', 'Rahbar yoki mutaxassis kamerada gapira oladi — ekspert videolari uchun imkoniyat.', ['co.expert', 'mk.content'], 'inferred');
  if (has(records, 'id.reason', 'branding')) add('Brending', 'Mijoz brending yoki logotipni o‘zi so‘radi.', ['id.reason'], 'confirmed');
  if (has(records, 'mk.challenge', 'weak_brand') || has(records, 'id.maturity', 'prelaunch'))
    add('Brending', 'Raqobatchilardan farq ko‘rinmayapti yoki biznes endi ochilyapti.', ['mk.challenge', 'id.maturity'], 'inferred');
  if (has(records, 'web.need', 'new', 'update') || has(records, 'clarify.site', 'has_update', 'none_new', 'old_new'))
    add('Veb-sayt', 'Mijoz yangi sayt yoki saytni yangilashni tanladi.', ['web.need', 'clarify.site'], 'confirmed');
  if (has(records, 'id.reason', 'automation')) add('CRM / avtomatlashtirish', 'Mijoz so‘rovlar bilan ishlashni tartibga solishni so‘radi.', ['id.reason'], 'confirmed');
  if (
    has(records, 'mk.tracking', 'no', 'partly', 'sheet') ||
    has(records, 'mk.lead_handling', 'day', 'irregular') ||
    has(records, 'cl.response', 'busy', 'after_hours', 'no_admin') ||
    has(records, 'mk.challenge', 'slow_reply', 'no_data') ||
    has(records, 'sa.followup', 'manual', 'none') ||
    has(records, 'cl.bottleneck', 'calls', 'no_show', 'reminders')
  )
    add(
      'CRM / avtomatlashtirish',
      'So‘rovdan sotuvgacha kuzatuv yoki javob tezligida bo‘shliq bor — reklamadan oldin yoki u bilan birga hal qilinishi kerak.',
      ['mk.tracking', 'mk.lead_handling', 'cl.response', 'mk.challenge', 'sa.followup', 'cl.bottleneck'],
      'inferred',
    );

  // ---------------------------------------------------------------- notes: things the strategy must respect
  const notes: Item[] = [];
  const b2bOnly = choice(records, 'id.customers').length > 0 && choice(records, 'id.customers').every((c) => c === 'b2b' || c === 'resellers' || c === 'gov');
  if (b2bOnly || (choice(records, 'b2.buyers').length && !has(records, 'b2.buyers', 'consumers')))
    notes.push({
      text: 'Mijozlar asosan kompaniyalar yoki qayta sotuvchilar: Instagram obunachilari asosiy maqsad emas — B2B lid generatsiya, hamkorlar uchun taklif va savdo jamoasi bilan ishlash ustuvor.',
      basis: 'inferred',
      evidence: ['id.customers', 'b2.buyers'].filter((k) => get(records, k)),
    });
  if (has(records, 'mf.capacity', 'full'))
    notes.push({ text: 'Ishlab chiqarish quvvati to‘liq band: talabni oshirishdan oldin quvvat masalasi hal qilinishi kerak.', basis: 'inferred', evidence: ['mf.capacity'] });
  if (has(records, 'bt.load', 'full') || has(records, 'co.capacity', 'few'))
    notes.push({ text: 'Bo‘sh sig‘im kam: ko‘p yangi so‘rov jalb qilish xizmat sifatiga zarar berishi mumkin.', basis: 'inferred', evidence: ['bt.load', 'co.capacity'].filter((k) => get(records, k)) });
  if (has(records, 'ed.retention', 'half', 'many_leave') || has(records, 'tc.churn', 'some_leave', 'many_leave'))
    notes.push({ text: 'Mijozlarni saqlab qolishda muammo bor: faqat yangi mijoz jalb qilish yetarli bo‘lmaydi.', basis: 'inferred', evidence: ['ed.retention', 'tc.churn'].filter((k) => get(records, k)) });

  // ---------------------------------------------------------------- website requirements
  let website: Facts['website'] = null;
  const need = choice(records, 'web.need')[0];
  const resolvedNeed = get(records, 'clarify.site')?.question.options.find((o) => o.key === choice(records, 'clarify.site')[0])?.resolves?.['web.need']?.choice?.[0];
  const wants = (resolvedNeed ?? need) === 'new' || (resolvedNeed ?? need) === 'update';
  if (wants) {
    const reqs = new Map<string, Requirement>();
    const put = (r: Requirement) => {
      const prev = reqs.get(r.id);
      if (!prev || RANK[r.level] > RANK[prev.level]) reqs.set(r.id, prev ? { ...r, evidence: [...new Set([...prev.evidence, ...r.evidence])] } : r);
      else prev.evidence = [...new Set([...prev.evidence, ...r.evidence])];
    };
    const notNeeded: Requirement[] = [];
    const unknown: string[] = [];
    const moduleRec = records.find((r) => r.key.startsWith('ws.modules.'));
    const must = new Set(choice(records, 'ws.must'));
    if (moduleRec) {
      if (moduleRec.value.unknown) unknown.push('Saytda qaysi funksiyalar kerakligi hali aniq emas.');
      const chosen = moduleRec.value.choice ?? [];
      for (const o of moduleRec.question.options) {
        if (!o.req) continue;
        const r: Requirement = { id: o.req.id, title: o.req.title, level: must.has(o.key) ? 'must' : 'should', evidence: [moduleRec.key, ...(must.has(o.key) ? ['ws.must'] : [])] };
        if (chosen.includes(o.key)) put(r);
        else if (!moduleRec.value.unknown) notNeeded.push({ ...r, level: 'nice' });
      }
      if (chosen.includes('other') && moduleRec.value.other)
        put({ id: 'client_other', title: `Mijoz qo‘shgan: ${moduleRec.value.other}`, level: must.has('other') ? 'must' : 'should', evidence: [moduleRec.key] });
    }
    const details: { key: string; question: string; labels: string[] }[] = [];
    for (const r of records) {
      if (r.question.stage !== 'website' || r.key === moduleRec?.key || r.key === 'ws.must') continue;
      if (r.value.unknown) {
        unknown.push(r.question.text);
        continue;
      }
      if (r.value.skipped) continue;
      details.push({ key: r.key, question: r.question.text, labels: labels(r) });
      for (const k of r.value.choice ?? []) {
        const o = r.question.options.find((x) => x.key === k);
        if (o?.req) put({ id: o.req.id, title: o.req.title, level: o.req.level ?? 'should', evidence: [r.key] });
      }
    }
    const all = [...reqs.values()];
    const assumptions = all.filter((r) => /imkoniyati tekshiriladi/.test(r.title)).map((r) => `${r.title.replace(/\s*\(imkoniyati tekshiriladi\)/, '')} — texnik imkoniyat hali tasdiqlanmagan.`);
    if (has(records, 'ws.domain', 'none', 'domain')) assumptions.push('Domen yoki xosting tayyorlanishi kerak.');
    if (choice(records, 'ws.assets').length === 0 && get(records, 'ws.assets')?.value.none) assumptions.push('Logotip, surat va matnlar tayyor emas — kontent ishlab chiqarish loyiha hajmiga kiradi.');
    website = {
      need: (resolvedNeed ?? need) === 'update' ? 'Hozirgi saytni yangilash' : 'Yangi sayt',
      goals: labels(get(records, 'ws.goal')),
      must: all.filter((r) => r.level === 'must'),
      should: all.filter((r) => r.level === 'should'),
      nice: all.filter((r) => r.level === 'nice'),
      notNeeded: notNeeded.filter((n) => !reqs.has(n.id)),
      unknown,
      details,
      assumptions,
    };
  }

  // ---------------------------------------------------------------- open questions for the meeting
  const openQuestions = records
    .filter((r) => r.value.unknown && r.question.stage !== 'website')
    .map((r) => `${r.question.text} (mijoz “Bilmayman” dedi)`)
    .slice(0, 8);
  if (website) openQuestions.push(...website.unknown.map((u) => `Sayt: ${u}`).slice(0, 6));

  return { profile, answers, goals, problems, marketing, operations, services, notes, website, openQuestions };
}

/** A compact, redaction-friendly text of the answers for the AI (keys kept so its claims can cite them). */
export function answersDigest(records: AnswerRecord[], max = 6000): string {
  const out: string[] = [];
  for (const r of records) {
    const l = labels(r).join('; ');
    out.push(`[${r.key}] (${r.question.stage}) ${r.question.text} → ${l}`);
  }
  const s = out.join('\n');
  return s.length > max ? `${s.slice(0, max)}\n…` : s;
}
