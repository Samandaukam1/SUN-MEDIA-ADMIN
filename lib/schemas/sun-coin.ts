import { z } from 'zod';

export const COIN_LIMIT = 1_000_000_000;
export const COIN_OPTION_LIMIT = 30;
const coinInteger = z.number().int('Butun son kiriting').min(1, 'Kamida 1 bo‘lsin').max(COIN_LIMIT, 'Qiymat juda katta');
const score = z.number().int().min(0).max(10);

export const coinRewardOptionSchema = z.object({
  amount: coinInteger,
  quantity: coinInteger.nullable(),
  weight: coinInteger,
  minScore: score,
  maxScore: score,
}).refine((v) => v.minScore <= v.maxScore, { message: 'Gol oralig‘i boshidan oxirigacha o‘sishi kerak', path: ['maxScore'] });

export const coinCampaignSchema = z.object({
  gameId: z.literal('safi-penalty'),
  title: z.string().trim().min(1, 'Kampaniya nomini kiriting').max(120),
  totalPool: coinInteger,
  minimumScore: score,
  strategy: z.enum(['FIRST_ELIGIBLE', 'WEIGHTED_RANDOM']),
  status: z.enum(['draft', 'active']),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  options: z.array(coinRewardOptionSchema).min(1, 'Kamida bitta mukofot qo‘shing').max(COIN_OPTION_LIMIT),
}).superRefine((v, ctx) => {
  if (v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
    ctx.addIssue({ code: 'custom', message: 'Tugash vaqti boshlanishdan keyin bo‘lsin', path: ['endsAt'] });
  }
  for (const [index, option] of v.options.entries()) {
    if (option.amount > v.totalPool) ctx.addIssue({ code: 'custom', message: 'Bitta mukofot pooldan oshmasin', path: ['options', index, 'amount'] });
    if (option.maxScore < v.minimumScore) ctx.addIssue({ code: 'custom', message: 'Gol oralig‘i minimum scorega yetishi kerak', path: ['options', index, 'maxScore'] });
  }
  const fixedCost = v.options.reduce((sum, option) => sum + option.amount * (option.quantity ?? 0), 0);
  if (!Number.isSafeInteger(fixedCost) || fixedCost > v.totalPool) {
    ctx.addIssue({ code: 'custom', message: 'Miqdor × g‘oliblar jami reward pooldan oshmasin', path: ['options'] });
  }
});

export type CoinCampaignConfig = z.infer<typeof coinCampaignSchema>;

/** Pool-only options are an upper bound: a leftover smaller than every payout may remain. */
export function coinDistributionSummary(totalPool: number, options: { amount: number; quantity: number | null }[]) {
  const fixedCost = options.reduce((sum, option) => sum + option.amount * (option.quantity ?? 0), 0);
  const poolLimited = options.some((option) => option.quantity === null);
  return {
    fixedCost,
    poolLimited,
    maximumDistribution: poolLimited ? totalPool : fixedCost,
    unallocated: poolLimited ? null : totalPool - fixedCost,
    exceedsPool: fixedCost > totalPool || options.some((option) => option.amount > totalPool),
  };
}

const nonnegative = z.number().int().nonnegative();
export const coinCampaignStatusSchema = z.enum(['draft', 'active', 'paused', 'ended']);
const dashboardOptionSchema = z.object({
  id: z.string(), amount: coinInteger, quantity: coinInteger.nullable(), awarded: nonnegative,
  weight: coinInteger, minScore: score, maxScore: score, sortOrder: nonnegative,
});
export const coinDashboardCampaignSchema = z.object({
  id: z.uuid(), gameId: z.string(), title: z.string(), status: coinCampaignStatusSchema,
  totalPool: nonnegative, distributed: nonnegative, remaining: nonnegative,
  minimumScore: score, strategy: z.enum(['FIRST_ELIGIBLE', 'WEIGHTED_RANDOM']),
  startsAt: z.string(), endsAt: z.string().nullable(), createdAt: z.string(),
  totalWinners: nonnegative, options: z.array(dashboardOptionSchema),
});
export const coinPackSchema = z.object({
  id: z.uuid(), coins: coinInteger, priceCents: z.number().int().positive(), currency: z.string(), isActive: z.boolean(), sortOrder: nonnegative,
});
export const coinPurchaseRequestSchema = z.object({
  id: z.uuid(), packId: z.uuid(), coins: coinInteger, priceCents: z.number().int().positive(), currency: z.string(),
  status: z.enum(['pending', 'fulfilled', 'rejected', 'cancelled']), note: z.string().nullable(),
  createdAt: z.string(), resolvedAt: z.string().nullable(), userName: z.string().nullable(), clientName: z.string().nullable(),
});
export const coinAdminDashboardSchema = z.object({
  campaigns: z.array(coinDashboardCampaignSchema),
  analytics: z.object({ purchased: nonnegative, spent: nonnegative, rewarded: nonnegative, circulating: nonnegative, totalWinners: nonnegative }),
  packs: z.array(coinPackSchema).default([]),
  purchaseRequests: z.array(coinPurchaseRequestSchema).default([]),
});

/** A pack as typed in the panel: whole coins, a price in currency units ("4.99"), an ISO currency code. */
export const coinPackFormSchema = z.object({
  coins: z.number().int('Butun son kiriting').min(1, 'Kamida 1 SC').max(1_000_000, 'Juda katta'),
  price: z.number().positive('Narx 0 dan katta bo‘lsin').max(1_000_000, 'Narx juda katta')
    .refine((v) => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Ko‘pi bilan 2 xonali kasr'),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, '3 harfli valyuta kodi (USD, UZS)'),
  sortOrder: z.number().int().min(0).max(99),
});

export type CoinPack = z.infer<typeof coinPackSchema>;
export type CoinPurchaseRequest = z.infer<typeof coinPurchaseRequestSchema>;

export type CoinCampaign = z.infer<typeof coinDashboardCampaignSchema>;
export type CoinCampaignStatus = z.infer<typeof coinCampaignStatusSchema>;
