import { z } from 'zod';

/**
 * SAFI Penalty levels and reward rules, as SUN MEDIA manages them. All of it is internal: the player's app never
 * receives a level, a top result or a rule — only the round, and at the end what was won.
 */
export const SAFI_LEVELS = [
  { key: 'easy', label: 'Oson' },
  { key: 'normal', label: 'O‘rta' },
  { key: 'hard', label: 'Qiyin' },
  { key: 'very_hard', label: 'Juda qiyin' },
  { key: 'extreme', label: 'Ekstremal' },
] as const;
export type SafiLevel = (typeof SAFI_LEVELS)[number]['key'];
export const safiLevelSchema = z.enum(['easy', 'normal', 'hard', 'very_hard', 'extreme']);

export const REWARD_LIMIT = 1_000_000;
export const PRO_DAYS_LIMIT = 365;
export const rewardTypeSchema = z.enum(['SUN_COIN', 'PRO_DAYS']);
export type RewardType = z.infer<typeof rewardTypeSchema>;

export const rewardRuleSchema = z.object({
  score: z.number().int('Butun son').min(1, 'Gol 1–10').max(10, 'Gol 1–10'),
  type: rewardTypeSchema,
  amount: z.number().int('Butun son kiriting').min(1, 'Kamida 1').max(REWARD_LIMIT, 'Qiymat juda katta'),
  quantity: z.number().int('Butun son kiriting').min(1, 'Kamida 1').max(REWARD_LIMIT, 'Qiymat juda katta').nullable(),
  enabled: z.boolean(),
}).refine((r) => r.type !== 'PRO_DAYS' || r.amount <= PRO_DAYS_LIMIT, { message: 'Pro ko‘pi bilan 365 kun', path: ['amount'] });
export type RewardRuleInput = z.infer<typeof rewardRuleSchema>;

const uniqueScores = (rules: { score: number }[]) => new Set(rules.map((r) => r.score)).size === rules.length;
export const rewardRulesSchema = z.array(rewardRuleSchema).min(1, 'Kamida bitta qoida qo‘shing').max(10)
  .refine(uniqueScores, { message: 'Har bir gol soni uchun bitta qoida' });

export const rewardCampaignSchema = z.object({
  gameId: z.literal('safi-penalty'),
  title: z.string().trim().min(1, 'Kampaniya nomini kiriting').max(100),
  status: z.enum(['draft', 'active']),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  rules: rewardRulesSchema,
}).superRefine((v, ctx) => {
  if (v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
    ctx.addIssue({ code: 'custom', message: 'Tugash vaqti boshlanishdan keyin bo‘lsin', path: ['endsAt'] });
  }
});
export type RewardCampaignConfig = z.infer<typeof rewardCampaignSchema>;

export const rewardCampaignUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Kampaniya nomini kiriting').max(100),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  rules: rewardRulesSchema,
}).superRefine((v, ctx) => {
  if (v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
    ctx.addIssue({ code: 'custom', message: 'Tugash vaqti boshlanishdan keyin bo‘lsin', path: ['endsAt'] });
  }
});

/** The example SUN MEDIA starts from — every value can be changed. */
export const DEFAULT_REWARD_RULES: RewardRuleInput[] = [
  { score: 7, type: 'SUN_COIN', amount: 3, quantity: null, enabled: true },
  { score: 8, type: 'SUN_COIN', amount: 5, quantity: null, enabled: true },
  { score: 9, type: 'PRO_DAYS', amount: 7, quantity: null, enabled: true },
  { score: 10, type: 'PRO_DAYS', amount: 30, quantity: null, enabled: true },
];

const n = z.number().int().nonnegative();
export const levelProfileSchema = z.object({
  key: safiLevelSchema, index: n, top: n, average: z.number(), distribution: z.array(z.number()).length(11),
});
export type LevelProfile = z.infer<typeof levelProfileSchema>;
export const rewardRuleRowSchema = z.object({
  id: z.uuid(), score: n, type: rewardTypeSchema, amount: n, quantity: n.nullable(), awarded: n, remaining: n.nullable(), enabled: z.boolean(),
});
export const rewardCampaignRowSchema = z.object({
  id: z.uuid(), gameId: z.string(), title: z.string(), status: z.enum(['draft', 'active', 'paused', 'ended']),
  startsAt: z.string(), endsAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), live: z.boolean(),
  winners: n, coinsGiven: n, proDaysGiven: n, rules: z.array(rewardRuleRowSchema),
});
export type RewardCampaignRow = z.infer<typeof rewardCampaignRowSchema>;
export type RewardRuleRow = z.infer<typeof rewardRuleRowSchema>;
export const rewardAdminSchema = z.object({
  settings: z.array(z.object({ gameId: z.string(), difficulty: safiLevelSchema, updatedAt: z.string() })).default([]),
  levels: z.array(levelProfileSchema),
  rewardCampaigns: z.array(rewardCampaignRowSchema),
  rewardSummary: z.object({ rounds: n, coins: n, proDays: n, winners: n }),
});

export function levelLabel(key: string): string {
  return SAFI_LEVELS.find((l) => l.key === key)?.label ?? key;
}

export function rewardLabel(rule: { type: RewardType; amount: number }): string {
  return rule.type === 'SUN_COIN' ? `${rule.amount.toLocaleString('en-US')} SC` : `${rule.amount} kun Pro`;
}

/**
 * How often a round at a level ends with each rule (the best switched-on rule the score reaches), from the level's
 * exact score distribution; stock is left out. Scores are 0…10, `distribution[s]` = P(score = s).
 */
export function ruleOdds(distribution: readonly number[], rules: readonly { score: number; enabled: boolean }[]): Map<number, number> {
  const on = [...rules].filter((r) => r.enabled).sort((a, b) => a.score - b.score);
  const odds = new Map<number, number>();
  on.forEach((rule, i) => {
    const until = i + 1 < on.length ? on[i + 1].score : 11;
    let p = 0;
    for (let s = rule.score; s < until && s < distribution.length; s++) p += distribution[s] ?? 0;
    odds.set(rule.score, p);
  });
  return odds;
}

/** Rules the level can never pay: their score is above the level's top result. */
export function unreachableRules(top: number, rules: readonly { score: number; enabled: boolean }[]): number[] {
  return rules.filter((r) => r.enabled && r.score > top).map((r) => r.score).sort((a, b) => a - b);
}

export const percent = (p: number) => p > 0 && p < .001 ? "<0.1%" : `${(Math.round(p * 1000) / 10).toLocaleString('en-US')}%`;
