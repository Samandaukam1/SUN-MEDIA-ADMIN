/** Client billing words shared by the list, the client page and the editor. */

export type Billing = {
  agreed_price: number | null;
  currency: string;
  billing_period: string;
  next_payment_on: string | null;
  next_payment_amount: number | null;
  payment_status: string;
  last_paid_on: string | null;
  note: string | null;
  site_plan_id?: string | null;
};

/** A published tariff as a client's plan: name, list price (reference only) and contents. */
export type TariffOption = { id: string; name: string; price: number | null; currency: string; period: string; items: string[] };

export const BILLING_PERIOD: Record<string, string> = { monthly: 'Har oy', quarterly: 'Har 3 oy', yearly: 'Har yil', one_time: 'Bir martalik' };

export function paymentState(b: Pick<Billing, 'payment_status' | 'next_payment_on'>, today: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'info' } {
  if (b.payment_status === 'paid') return { label: 'To‘langan', tone: 'success' };
  if (b.next_payment_on && b.next_payment_on < today) return { label: 'Muddati o‘tgan', tone: 'danger' };
  if (b.payment_status === 'partial') return { label: 'Qisman to‘langan', tone: 'info' };
  return { label: 'Kutilmoqda', tone: 'warning' };
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
/** "2026-10-25" → "25-oktabr" (and the year when it is not this year). */
export function payDate(key: string | null, today: string): string {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return `${d}-${MONTHS[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`;
}

/** The published tariffs (Sayt → Tariflar) as plan choices for clients. */
export function tariffOptions(plans: { id: string; name: string; price: number | null; currency: string; priceMode: string; billingPeriod: string; items: { name: string; quantity: string | null }[] }[]): TariffOption[] {
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.priceMode === 'negotiable' || p.price === null ? null : Number(p.price),
    currency: p.currency,
    period: p.billingPeriod,
    items: p.items.map((i) => (i.quantity ? `${i.name} — ${i.quantity}` : i.name)),
  }));
}
