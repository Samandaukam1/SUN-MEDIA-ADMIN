import 'server-only';

import { getSiteContent } from '@/lib/site/content';
import { formatPrice, plainTitle, quantityLabel } from '@/lib/site/types';

/**
 * What "Sunny" (the SUN MEDIA assistant) knows about the agency: built from the published site content
 * (Panel → Sayt), so editing a service, tariff or FAQ there updates the assistant too. Trimmed to stay small.
 */
export async function agencyKnowledge(): Promise<string> {
  const c = await getSiteContent();
  const s = c.settings;
  const lines: string[] = [];
  const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n).trimEnd()}…` : text);

  lines.push('## Aloqa');
  if (s.phone_primary) lines.push(`Telefon: ${s.phone_primary}${s.phone_secondary ? `, ${s.phone_secondary}` : ''}`);
  if (s.email) lines.push(`Email: ${s.email}`);
  if (s.address) lines.push(`Manzil: ${s.address}`);
  if (s.working_hours) lines.push(`Ish vaqti: ${s.working_hours}`);
  if (s.telegram_url) lines.push(`Telegram: ${s.telegram_url}`);
  if (s.instagram_url) lines.push(`Instagram: ${s.instagram_url}`);

  if (s.about_body) lines.push('', '## Biz haqimizda', cut(plainTitle(s.about_title) + '. ' + s.about_body, 1200));

  if (c.stats.length) lines.push('', '## Raqamlar', ...c.stats.map((x) => `- ${x.value} — ${x.label}`));

  if (c.services.length) {
    lines.push('', '## Xizmatlar');
    for (const x of c.services) {
      lines.push(`- **${plainTitle(x.title)}**: ${cut(x.summary, 260)}${x.bullets.length ? ` (${x.bullets.slice(0, 6).join('; ')})` : ''}`);
    }
  }

  if (c.plans.length) {
    lines.push('', '## Tariflar (sahifa: /tariflar)');
    for (const p of c.plans) {
      const price =
        p.priceMode === 'negotiable' || p.price === null
          ? 'kelishiladi'
          : `${p.priceMode === 'from' ? 'dan ' : ''}${formatPrice(Number(p.price), p.currency)}${p.billingPeriod === 'monthly' ? ' / oy' : ''}`;
      const items = p.items.map((i) => `${i.name}${i.quantity ? ` ${quantityLabel(i.quantity)}` : ''}`).join(', ');
      lines.push(`- **${p.name}**${p.isFeatured ? ' (tavsiya)' : ''} — ${price}. ${cut(p.description, 200)}${items ? ` Ichida: ${items}.` : ''}`);
    }
  }

  if (c.steps.length) lines.push('', '## Ish jarayoni', ...c.steps.map((x, i) => `${i + 1}. ${x.title} — ${cut(x.description, 160)}`));

  if (c.cases.length) {
    lines.push('', '## Keyslar (sahifa: /keyslar/<slug>)');
    for (const k of c.cases.slice(0, 24)) {
      const results = k.results.map((r) => `${r.value} ${r.label}`).join(', ');
      lines.push(`- ${plainTitle(k.title)} [/keyslar/${k.slug}] — ${k.clientName}, ${k.category}${k.year ? `, ${k.year}` : ''}. ${cut(k.summary, 200)}${results ? ` Natija: ${results}.` : ''}`);
    }
  }

  if (c.partners.length) {
    lines.push('', '## Hamkorlar (sahifa: /hamkorlar/<slug>)');
    lines.push(c.partners.map((p) => `${p.name}${p.industry ? ` (${p.industry})` : ''} [/hamkorlar/${p.slug}]`).join('; '));
  }

  if (c.faqs.length) lines.push('', '## Ko‘p so‘raladigan savollar', ...c.faqs.map((f) => `- S: ${f.question}\n  J: ${cut(f.answer, 400)}`));

  const pages = c.pages.filter((p) => p.is_published).map((p) => `${p.path} — ${p.nav_label || plainTitle(p.title)}`);
  if (pages.length) lines.push('', '## Sayt sahifalari', ...pages.map((p) => `- ${p}`));

  return cut(lines.join('\n'), 16_000);
}

/** Cheapest published tariff with a price: offered as a budget hint when the visitor does not know one. */
export async function budgetHints(): Promise<string[]> {
  const c = await getSiteContent();
  return c.plans
    .filter((p) => p.priceMode !== 'negotiable' && p.price !== null && Number(p.price) > 0)
    .map((p) => `${p.name}: ${formatPrice(Number(p.price), p.currency)}`);
}
