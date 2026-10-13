import 'server-only';

import { z } from 'zod';

import { askClaude, extractJson, type AiContent } from '@/lib/ai';
import { getSiteContent } from '@/lib/site/content';
import { formatPrice } from '@/lib/site/types';
import type { ProfileFacts, ProfileNumbers } from './instagram';

const list = z.array(z.string()).catch([]);
const text = z.string().catch('');

export const briefSchema = z.object({
  summary: text,
  client_type: text,
  needs: list,
  expectations: list,
  risks: list,
  recommended_plan: z.object({ name: text, fit: z.coerce.number().min(0).max(100).catch(0), why: text }).catch({ name: '', fit: 0, why: '' }),
  alternative_plan: z.object({ name: text, why: text }).nullable().catch(null),
  first_month: list,
  content_mix: list,
  kpis: list,
  pitch: text,
  questions_to_clarify: list,
});
export type BriefResult = z.infer<typeof briefSchema>;

export const instagramSchema = z.object({
  summary: text,
  score: z.coerce.number().min(0).max(100).catch(0),
  audience: z.object({ verdict: z.enum(['healthy', 'mixed', 'suspicious', 'unknown']).catch('unknown'), explanation: text }).catch({ verdict: 'unknown', explanation: '' }),
  strengths: list,
  mistakes: list,
  profile_fixes: list,
  bio_suggestion: text,
  content_ideas: list,
  growth_plan: list,
  posting_plan: text,
  recommended_plan: z.object({ name: text, why: text }).nullable().catch(null),
});
export type InstagramResult = z.infer<typeof instagramSchema>;

/** SUN MEDIA's own offer, as published on the site: what the AI may recommend. */
async function agencyOffer(): Promise<string> {
  const c = await getSiteContent();
  const plans = c.plans
    .map((p) => {
      const price = p.priceMode === 'negotiable' || p.price === null ? 'narx kelishiladi' : `${formatPrice(Number(p.price), p.currency)}${p.billingPeriod === 'monthly' ? ' / oy' : ''}`;
      const items = p.items.map((i) => `${i.name}${i.quantity ? ` — ${i.quantity}` : ''}${i.note ? ` (${i.note})` : ''}`).join('; ');
      return `• ${p.name} — ${price}${p.description ? `. ${p.description}` : ''}. Tarkibi: ${items}`;
    })
    .join('\n');
  const services = c.services.map((s) => `• ${s.title}: ${s.summary}`).join('\n');
  return `SUN MEDIA tariflari:\n${plans || '— tariflar saytda hali e’lon qilinmagan'}\n\nSUN MEDIA xizmatlari:\n${services || '—'}`;
}

const STYLE = `Faqat o‘zbek tilida (lotin yozuvi) yoz. Aniq, amaliy va qisqa yoz: har bir punkt bitta jumla yoki qisqa ibora.
Berilmagan ma’lumotni o‘ylab topma; taxmin bo‘lsa, “taxminan” deb yoz. Faqat JSON qaytar, boshqa matn yozma.`;

export async function analyseBrief(input: { name: string; company: string | null; instagram: string | null; answers: { question: string; answer: string }[] }) {
  const offer = await agencyOffer();
  const system = `Sen SUN MEDIA marketing agentligining tajribali strategi va savdo maslahatchisisan. Agentlik menejeri yangi mijoz bilan suhbat o‘tkazdi.
Vazifang: mijozga aslida nima kerakligini, nimadan ko‘ngli to‘lishini aniqlash, mos tarifni tanlash va jamoaga nima qilish kerakligini aytish.
${STYLE}
JSON tuzilmasi:
{"summary": "mijoz haqida 2–3 jumla", "client_type": "mijoz turi", "needs": ["aslida nima kerak"], "expectations": ["qaysi natija ko‘nglini to‘ldiradi"], "risks": ["xavf va kutilmalar nomuvofiqligi"], "recommended_plan": {"name": "tarif nomi aynan ro‘yxatdagidek", "fit": 0-100, "why": "nega"}, "alternative_plan": {"name": "...", "why": "..."} yoki null, "first_month": ["birinchi oy qadamlari"], "content_mix": ["kontent tarkibi va soni"], "kpis": ["o‘lchanadigan maqsadlar"], "pitch": "menejer mijozga aytadigan qisqa taklif matni (3–5 jumla)", "questions_to_clarify": ["yana aniqlash kerak bo‘lgan savollar"]}
Tarifni faqat quyidagi ro‘yxatdan tanla. Agar hech biri mos kelmasa, eng yaqinini tanlab, nimasi yetishmasligini "why"da yoz.

${offer}`;
  const body = [
    `Mijoz: ${input.name}${input.company ? `, ${input.company}` : ''}${input.instagram ? `, Instagram: ${input.instagram}` : ''}`,
    'Suhbat javoblari:',
    ...input.answers.map((a, i) => `${i + 1}. ${a.question}\n   Javob: ${a.answer}`),
  ].join('\n');
  const { text: reply, model } = await askClaude({ system, content: [{ type: 'text', text: body }] });
  return { result: briefSchema.parse(extractJson(reply)), model };
}

export async function analyseInstagram(input: {
  handle: string;
  numbers: ProfileNumbers;
  facts: ProfileFacts;
  bio: string;
  answers: { question: string; answer: string }[];
  images: AiContent[];
}) {
  const offer = await agencyOffer();
  const system = `Sen Instagram bo‘yicha tajribali auditor va o‘sish strategisan (SUN MEDIA agentligi). Profil raqamlari, hisoblangan ko‘rsatkichlar va skrinshotlar beriladi.
Vazifang: profilni baholash, auditoriya jonli yoki nakrutka ekanini (faqat berilgan raqam va skrinshotlarga asoslanib, ehtimol sifatida) aytish, xatolar, kamchiliklar va qanday rivojlantirish mumkinligini yozish.
Hisoblangan ko‘rsatkichlar aniq arifmetika — ularga tayan, ularni o‘zgartirma. Skrinshotda ko‘rinmagan narsani ko‘rdim deb yozma.
${STYLE}
JSON tuzilmasi:
{"summary": "2–3 jumla umumiy xulosa", "score": 0-100, "audience": {"verdict": "healthy" | "mixed" | "suspicious" | "unknown", "explanation": "nega shunday deb o‘ylaysan"}, "strengths": ["kuchli tomonlari"], "mistakes": ["xatolar va kamchiliklar"], "profile_fixes": ["bio, avatar, highlights, link va h.k. tuzatishlar"], "bio_suggestion": "tayyor bio matni", "content_ideas": ["aniq kontent g‘oyalari"], "growth_plan": ["30/60/90 kunlik o‘sish qadamlari"], "posting_plan": "haftalik post/Reels/Story rejasi", "recommended_plan": {"name": "SUN MEDIA tarifi", "why": "nega"} yoki null}

${offer}`;
  const n = input.numbers;
  const f = input.facts;
  const facts = [
    `Profil: ${input.handle}`,
    `Obunachilar: ${n.followers}; obuna bo‘lganlari: ${n.following ?? 'kiritilmagan'}; postlar: ${n.posts ?? 'kiritilmagan'}`,
    `Oxirgi postlar bo‘yicha o‘rtacha: layk ${n.avgLikes ?? 'kiritilmagan'}, izoh ${n.avgComments ?? 'kiritilmagan'}, video ko‘rish ${n.avgViews ?? 'kiritilmagan'}`,
    `Oxirgi 30 kunda postlar: ${n.postsLast30 ?? 'kiritilmagan'}`,
    `Hisoblangan: engagement ${f.engagementRate ?? '—'}% (shu hajm uchun odatiy ${f.expected[0]}–${f.expected[1]}%), ko‘rish/obunachi ${f.viewsPerFollower ?? '—'}, izoh/layk ${f.commentsPerLike ?? '—'}, obuna/obunachi ${f.followingRatio ?? '—'}, haftasiga ${f.postsPerWeek ?? '—'} post`,
    `Qoidaga asoslangan belgilar: ${f.signals.length ? f.signals.join('; ') : 'shubhali belgi topilmadi'}`,
    input.bio ? `Bio matni: ${input.bio}` : '',
    input.answers.length ? `Mijoz bilan suhbatdan:\n${input.answers.map((a) => `- ${a.question} — ${a.answer}`).join('\n')}` : '',
    input.images.length ? `${input.images.length} ta skrinshot ilova qilingan.` : 'Skrinshot berilmagan.',
  ]
    .filter(Boolean)
    .join('\n');
  const { text: reply, model } = await askClaude({ system, content: [...input.images, { type: 'text', text: facts }], maxTokens: 4500 });
  return { result: instagramSchema.parse(extractJson(reply)), model };
}
