import { z } from 'zod';

import { safiLevelSchema } from './game-rewards';

export const COIN_LIMIT = 1_000_000_000;
const coinInteger = z.number().int('Butun son kiriting').min(1, 'Kamida 1 bo‘lsin').max(COIN_LIMIT, 'Qiymat juda katta');
const score = z.number().int().min(0).max(10);
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
  analytics: z.object({ purchased: nonnegative, spent: nonnegative, rewarded: nonnegative, gifted: nonnegative.default(0), circulating: nonnegative, totalWinners: nonnegative }),
  packs: z.array(coinPackSchema).default([]),
  settings: z.array(z.object({ gameId: z.string(), difficulty: safiLevelSchema, updatedAt: z.string() })).default([]),
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

export const coinGiftSchema = z.object({
  email: z.email('Mijoz emailini kiriting'),
  amount: z.number().int('Butun son kiriting').min(1, 'Kamida 1 SC').max(100_000, 'Bir sovg‘a 100 000 SC gacha'),
  note: z.string().trim().max(200),
});
export type CoinPack = z.infer<typeof coinPackSchema>;
export type CoinPurchaseRequest = z.infer<typeof coinPurchaseRequestSchema>;

export type CoinCampaign = z.infer<typeof coinDashboardCampaignSchema>;
export type CoinCampaignStatus = z.infer<typeof coinCampaignStatusSchema>;
