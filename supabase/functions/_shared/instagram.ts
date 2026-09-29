// Daily Instagram sync for one connected account: profile, yesterday's insights (+ a 30-day backfill on the first
// run), rolling 7/30-day reach, month totals and the latest posts with their insights. Only what Meta returns is
// stored; a metric Meta refuses for this account is left empty, never guessed.
import { adminMessage, agencyDate, agencyDay, collect, insightTotals, mediaRow, snapshotFromInsights, type Graph, type MediaNode } from './meta.ts';
import { readToken, type Service } from './clients.ts';

export type SyncAccount = {
  asset_id: string;
  social_account_id: string;
  client_id: string;
  ig_user_id: string;
  token_asset_id: string | null;
  connection_id: string | null;
  last_snapshot: string | null;
};

const DAY_METRICS = 'views,reach,total_interactions,likes,comments,shares,saves,profile_links_taps,accounts_engaged';
const MEDIA_FIELDS = 'id,media_type,media_product_type,permalink,thumbnail_url,media_url,caption,timestamp,like_count,comments_count';
const MEDIA_METRICS: Record<string, string> = {
  REELS: 'views,reach,likes,comments,shares,saved,total_interactions',
  FEED: 'views,reach,likes,comments,shares,saved,total_interactions',
  STORY: 'views,reach,shares,total_interactions',
};

async function totals(graph: Graph, igUser: string, token: string, metrics: string, since: number, until: number) {
  // One metric Meta does not support for this account must not lose the others: retry them one by one.
  try {
    return insightTotals(await graph(`${igUser}/insights`, { metric: metrics, metric_type: 'total_value', period: 'day', since: String(since), until: String(until) }, { token }));
  } catch {
    const out: Record<string, number> = {};
    for (const metric of metrics.split(',')) {
      try {
        Object.assign(out, insightTotals(await graph(`${igUser}/insights`, { metric, metric_type: 'total_value', period: 'day', since: String(since), until: String(until) }, { token })));
      } catch {
        // not available for this account / period
      }
    }
    return out;
  }
}

async function mediaInsights(graph: Graph, node: MediaNode, token: string): Promise<Record<string, number>> {
  const metrics = MEDIA_METRICS[node.media_product_type ?? 'FEED'] ?? MEDIA_METRICS.FEED;
  try {
    return insightTotals(await graph(`${node.id}/insights`, { metric: metrics }, { token }));
  } catch {
    try {
      return insightTotals(await graph(`${node.id}/insights`, { metric: 'reach,likes,comments,saved' }, { token }));
    } catch {
      return {};
    }
  }
}

export async function syncInstagramAccount(service: Service, graph: Graph, account: SyncAccount, now = new Date()): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = (await readToken(service, 'asset', account.token_asset_id)) ?? (await readToken(service, 'connection', account.connection_id));
    if (!token) throw new Error('Instagram uchun Meta tokeni yo‘q. Integratsiyani qayta ulang.');
    const ig = account.ig_user_id;

    const profile = await graph<{ followers_count?: number; media_count?: number }>(ig, { fields: 'followers_count,media_count' }, { token });
    const yesterday = agencyDate(now, 1);

    // Yesterday: the completed day, with followers at the end of it and unique 7 / 30-day reach.
    const day = agencyDay(yesterday);
    const snapshot: Record<string, number> = {
      ...snapshotFromInsights(await totals(graph, ig, token, DAY_METRICS, day.since, day.until)),
    };
    if (typeof profile.followers_count === 'number') snapshot.followers = profile.followers_count;
    if (typeof profile.media_count === 'number') snapshot.media_count = profile.media_count;
    const week = await totals(graph, ig, token, 'reach', agencyDay(agencyDate(now, 7)).since, day.until);
    if ('reach' in week) snapshot.reach_7d = week.reach;
    const month = await totals(graph, ig, token, 'reach', agencyDay(agencyDate(now, 30)).since, day.until);
    if ('reach' in month) snapshot.reach_30d = month.reach;
    await rpc(service, 'ig_save_snapshot', { p_social_account: account.social_account_id, p_date: yesterday, p_metrics: snapshot });

    // First sync: the previous 29 days as far as Meta keeps them (followers history is not available from Meta).
    if (!account.last_snapshot) {
      for (let back = 2; back <= 30; back++) {
        const date = agencyDate(now, back);
        const d = agencyDay(date);
        const values = snapshotFromInsights(await totals(graph, ig, token, DAY_METRICS, d.since, d.until));
        if (Object.keys(values).length > 0) await rpc(service, 'ig_save_snapshot', { p_social_account: account.social_account_id, p_date: date, p_metrics: values });
      }
    }

    // Month of "yesterday": unique reach for the month when Meta allows the range (up to 30 days).
    const monthStart = `${yesterday.slice(0, 8)}01`;
    const monthEndDate = new Date(Date.UTC(Number(yesterday.slice(0, 4)), Number(yesterday.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const monthRange = agencyDay(monthStart);
    const period: Record<string, number> = {};
    if ((day.until - monthRange.since) / 86_400 <= 30) {
      const m = await totals(graph, ig, token, 'reach', monthRange.since, day.until);
      if ('reach' in m) period.reach = m.reach;
    }
    if (typeof profile.followers_count === 'number') {
      // The first sync of the month fixes followers_start (the database keeps the first value), the latest sets the end.
      period.followers_start = profile.followers_count;
      period.followers_end = profile.followers_count;
    }
    await rpc(service, 'ig_save_period', { p_social_account: account.social_account_id, p_start: monthStart, p_end: monthEndDate, p_metrics: period });

    // Latest posts and Reels, plus Stories that are still live.
    const media = await collect<MediaNode>(graph, `${ig}/media`, { fields: MEDIA_FIELDS, limit: '50' }, token, 50);
    let stories: MediaNode[] = [];
    try {
      stories = await collect<MediaNode>(graph, `${ig}/stories`, { fields: MEDIA_FIELDS }, token, 50);
    } catch {
      stories = [];
    }
    const rows = [];
    for (const node of [...media, ...stories]) rows.push(mediaRow(node, await mediaInsights(graph, node, token)));
    if (rows.length > 0) await rpc(service, 'ig_save_media', { p_social_account: account.social_account_id, p_items: rows });

    await rpc(service, 'ig_mark_synced', { p_asset_id: account.asset_id, p_error: null });
    return { ok: true };
  } catch (e) {
    const message = adminMessage(e);
    await service.rpc('ig_mark_synced', { p_asset_id: account.asset_id, p_error: message });
    return { ok: false, error: message };
  }
}

async function rpc(service: Service, fn: string, args: Record<string, unknown>) {
  const { error } = await service.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
}
