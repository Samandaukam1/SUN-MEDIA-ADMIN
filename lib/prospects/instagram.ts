/**
 * Instagram profile facts from the numbers typed in (or read off the screenshots). These are computed here, not by
 * the AI, so the verdict on bought followers rests on arithmetic the operator can check. Benchmarks are the usual
 * public industry ranges by audience size — an estimate, said so on screen.
 */

export type ProfileNumbers = {
  followers: number;
  following: number | null;
  posts: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgViews: number | null;
  postsLast30: number | null;
};

export type Verdict = 'healthy' | 'mixed' | 'suspicious';

export type ProfileFacts = {
  engagementRate: number | null;
  tier: string;
  expected: [number, number];
  viewsPerFollower: number | null;
  commentsPerLike: number | null;
  followingRatio: number | null;
  postsPerWeek: number | null;
  signals: string[];
  score: number;
  verdict: Verdict | null;
};

const TIERS: { upTo: number; name: string; expected: [number, number] }[] = [
  { upTo: 5_000, name: '5 mingdan kam', expected: [4, 8] },
  { upTo: 20_000, name: '5–20 ming', expected: [2.5, 5] },
  { upTo: 100_000, name: '20–100 ming', expected: [1.5, 3.5] },
  { upTo: 1_000_000, name: '100 ming – 1 mln', expected: [1, 2.5] },
  { upTo: Infinity, name: '1 mln dan ko‘p', expected: [0.5, 1.5] },
];

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function profileFacts(p: ProfileNumbers): ProfileFacts {
  const tier = TIERS.find((t) => p.followers < t.upTo) ?? TIERS[TIERS.length - 1];
  const interactions = p.avgLikes === null && p.avgComments === null ? null : (p.avgLikes ?? 0) + (p.avgComments ?? 0);
  const er = interactions !== null && p.followers > 0 ? round((interactions / p.followers) * 100) : null;
  const vpf = p.avgViews !== null && p.followers > 0 ? round(p.avgViews / p.followers) : null;
  const cpl = p.avgComments !== null && p.avgLikes ? round(p.avgComments / p.avgLikes, 4) : null;
  const fr = p.following !== null && p.followers > 0 ? round(p.following / p.followers) : null;
  const ppw = p.postsLast30 !== null ? round(p.postsLast30 / (30 / 7), 1) : null;

  const signals: string[] = [];
  let score = 0;
  if (er !== null) {
    if (er < tier.expected[0] * 0.4) {
      score += 3;
      signals.push(`Engagement ${er}% — bu hajmdagi sahifalar uchun odatiy ${tier.expected[0]}–${tier.expected[1]}% dan ancha past`);
    } else if (er < tier.expected[0]) {
      score += 1;
      signals.push(`Engagement ${er}% — odatiy ${tier.expected[0]}–${tier.expected[1]}% dan biroz past`);
    } else if (er > tier.expected[1] * 3) {
      score += 1;
      signals.push(`Engagement ${er}% — juda baland: konkurs/giveaway yoki layk sotib olinganini tekshiring`);
    }
  }
  if (vpf !== null && p.followers >= 1000) {
    if (vpf < 0.05) {
      score += 2;
      signals.push(`Video ko‘rishlar obunachilarning ${round(vpf * 100, 1)}% i — obunachilar videolarni deyarli ko‘rmaydi`);
    } else if (vpf < 0.15) {
      score += 1;
      signals.push(`Video ko‘rishlar obunachilarning ${round(vpf * 100, 1)}% i — past`);
    }
  }
  if (fr !== null && p.followers >= 1000 && fr > 1) {
    score += 1;
    signals.push('Obuna bo‘lganlari obunachilardan ko‘p — “obunaga obuna” usuli belgisi');
  }
  if (cpl !== null && p.avgLikes !== null && p.avgLikes >= 50 && cpl < 0.002) {
    score += 1;
    signals.push('Layklarga nisbatan izohlar juda kam — faol, jonli auditoriya belgisi kuchsiz');
  }
  const verdict: Verdict | null = er === null && vpf === null ? null : score <= 1 ? 'healthy' : score <= 3 ? 'mixed' : 'suspicious';
  return { engagementRate: er, tier: tier.name, expected: tier.expected, viewsPerFollower: vpf, commentsPerLike: cpl, followingRatio: fr, postsPerWeek: ppw, signals, score, verdict };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  healthy: 'Auditoriya asosan jonli',
  mixed: 'Aralash: shubhali qism bor',
  suspicious: 'Nakrutka ehtimoli yuqori',
};
