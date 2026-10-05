import { z } from 'zod';
export const safiArena = z.enum(['classic', 'night', 'summer', 'new_year', 'ramadan', 'campaign']);
export const safiPersonality = z.enum(['CLASSIC', 'SHOWMAN', 'SERIOUS']);
export const safiRuntime = z.object({
  enabled: z.boolean(), practice_enabled: z.boolean(), reward_enabled: z.boolean(), leaderboards_enabled: z.boolean(),
  free_interval_hours: z.number().int().min(1).max(8760), attempt_cost: z.number().int().min(1).max(100000),
  lucky_chance: z.number().min(0).max(.1), personality: safiPersonality, arena: safiArena,
});
export const safiEvent = z.object({
  id: z.uuid().optional(), title: z.string().trim().min(1).max(100), enabled: z.boolean(), boss: z.boolean(),
  starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }), arena: safiArena, personality: safiPersonality,
}).refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at), { message: 'Tugash vaqti boshlanishdan keyin bo‘lsin.' });
export const safiCosmetic = z.object({
  id: z.uuid().optional(), code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/), title: z.string().trim().min(1).max(100),
  slot: z.enum(['gloves', 'outfit', 'arena', 'trail', 'goal_effect', 'nameplate', 'badge']),
  price: z.number().int().min(0).max(100000), enabled: z.boolean(),
  appearance: z.object({ color: z.string().regex(/^#[\dA-Fa-f]{6}$/).optional(), arena: safiArena.optional(), symbol: z.enum(['star', 'shield', 'egg']).optional() }),
});
export const safiLimits = z.object({ id: z.uuid(), maxWins: z.number().int().min(1).max(10000).nullable(), cooldownHours: z.number().int().min(0).max(8760) });
export const safiAdmin = z.object({
  config: safiRuntime,
  events: z.array(safiEvent), cosmetics: z.array(safiCosmetic),
  campaignLimits: z.array(safiLimits.extend({ title: z.string() })),
  analytics: z.object({
    scoreDistribution: z.array(z.object({ score: z.number(), rounds: z.number() })),
    zoneHeatmap: z.array(z.object({ zone: z.number(), shots: z.number(), goals: z.number() })),
    returningPlayers: z.number(), retentionDay1: z.number().nullable(),
    mostPopularCosmetic: z.object({ title: z.string(), purchases: z.number() }).nullable(),
    campaignDistributed: z.number(), remainingRewardPool: z.array(z.object({ campaignId: z.uuid(), title: z.string(), rules: z.array(z.object({ type: z.string(), amount: z.number(), remaining: z.number().nullable() })).nullable() })),
  }),
});
export type SafiAdmin = z.infer<typeof safiAdmin>;
