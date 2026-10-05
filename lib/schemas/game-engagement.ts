import { z } from 'zod';

export const ENGAGEMENT_METRICS = [
  { key: 'LUCKY_EGGS', label: 'Lucky Egg hodisalari', max: 100_000 },
  { key: 'GOALS_TOTAL', label: 'Jami gollar', max: 100_000 },
  { key: 'ROUND_GOALS', label: 'Bir raunddagi gollar', max: 10 },
  { key: 'GOAL_COMBO', label: 'Ketma-ket gollar', max: 10 },
  { key: 'CORNER_GOALS', label: 'Burchaklarga gollar', max: 100_000 },
  { key: 'DISTINCT_ZONES', label: 'Turli zonalarga gollar', max: 15 },
  { key: 'GOAL_AFTER_SAVES', label: '3 ta ketma-ket savedan keyingi gollar', max: 100_000 },
  { key: 'PRACTICE_ROUNDS', label: 'Tugatilgan Practice raundlar', max: 100_000 },
  { key: 'SHOTS_TOTAL', label: 'Jami zarbalar', max: 100_000 },
  { key: 'SAVES_TOTAL', label: 'Darvozabon tutgan zarbalar', max: 100_000 },
  { key: 'COMPLETED_ROUNDS', label: 'Tugatilgan raundlar', max: 100_000 },
  { key: 'ALL_CORNERS', label: 'Turli burchaklarga gollar', max: 4 },
  { key: 'STREAK_DAYS', label: 'Faollik seriyasi (kun)', max: 100_000 },
] as const;

export const engagementMetricSchema = z.enum(ENGAGEMENT_METRICS.map((metric) => metric.key));
export const engagementKindSchema = z.enum(['challenge', 'achievement']);
export const engagementCapSchema = z.object({
  gameId: z.literal('safi-penalty'),
  dailyCoinCap: z.number().int('Butun son kiriting').min(0).max(100_000, 'Ko‘pi bilan 100 000 SC'),
});
export const engagementDefinitionSchema = z.object({
  id: z.uuid().optional(),
  gameId: z.literal('safi-penalty'),
  kind: engagementKindSchema,
  code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'Kod: 2–64 ta kichik lotin harfi, raqam yoki _. Harfdan boshlansin.'),
  title: z.string().trim().min(1, 'Nomini kiriting').max(100),
  description: z.string().trim().max(300),
  metric: engagementMetricSchema,
  target: z.number().int('Butun son kiriting').min(1).max(100_000),
  rewardCoins: z.number().int('Butun son kiriting').min(0).max(1000, 'Ko‘pi bilan 1 000 SC'),
  dailyRewardLimit: z.number().int('Butun son kiriting').min(0).max(10_000),
  enabled: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
}).superRefine((value, ctx) => {
  const maximum = ENGAGEMENT_METRICS.find((metric) => metric.key === value.metric)?.max ?? 100_000;
  if (value.target > maximum) ctx.addIssue({ code: 'custom', message: `Bu metrika uchun maqsad ${maximum} dan oshmasin`, path: ['target'] });
  if (value.rewardCoins > 0 && value.dailyRewardLimit === 0) ctx.addIssue({ code: 'custom', message: 'SUN Coin mukofoti uchun kunlik mukofot sonini belgilang', path: ['dailyRewardLimit'] });
  if (value.metric === 'PRACTICE_ROUNDS' && value.rewardCoins > 0) ctx.addIssue({ code: 'custom', message: 'Practice topshiriqlari SUN Coin bermaydi. Mukofotni 0 SC qiling.', path: ['rewardCoins'] });
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) ctx.addIssue({ code: 'custom', message: 'Tugash vaqti boshlanishdan keyin bo‘lsin', path: ['endsAt'] });
});

const count = z.number().int().nonnegative();
export const engagementDefinitionRowSchema = z.object({
  id: z.uuid(), kind: engagementKindSchema, code: z.string(), title: z.string(), description: z.string(),
  metric: engagementMetricSchema, target: count, rewardCoins: count, dailyRewardLimit: count,
  enabled: z.boolean(), startsAt: z.string(), endsAt: z.string().nullable(),
});
export const engagementAdminSchema = z.object({
  gameId: z.string(), dailyCoinCap: count, definitions: z.array(engagementDefinitionRowSchema),
  analytics: z.object({
    gamesPlayed: count, dailyActivePlayers: count, practiceRounds: count, rewardRounds: count,
    averageScore: z.number().nonnegative().nullable(), activeStreaks: count, longestStreak: count,
    challengeCompletions: count, achievementUnlocks: count, coinsAwarded: count, coinsSpent: count,
  }),
});
export type EngagementDefinition = z.infer<typeof engagementDefinitionRowSchema>;

export function engagementMetricLabel(key: string): string {
  return ENGAGEMENT_METRICS.find((metric) => metric.key === key)?.label ?? key;
}
