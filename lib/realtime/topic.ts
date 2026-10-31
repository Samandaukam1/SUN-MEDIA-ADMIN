'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { getBrowserClient } from '@/lib/supabase/client';

type Listener = {
  event: string;
  fn: (payload: Record<string, unknown>) => void;
};
type Entry = {
  listeners: Set<Listener>;
  statuses: Set<(connected: boolean) => void>;
  connected: boolean;
  stop: () => void;
};

const topics = new Map<string, Entry>();

/**
 * One private realtime channel per topic for the whole page, shared by everyone listening to it. realtime-js hands
 * out the same channel for the same topic, so two components subscribing on their own would collide (the second
 * subscribe throws, the first one to unmount closes it for both). The channel closes with its last listener.
 */
export function listenTopic(topic: string, event: string, fn: Listener['fn'], onStatus?: (connected: boolean) => void): () => void {
  let entry = topics.get(topic);
  if (!entry) {
    entry = open(topic);
    topics.set(topic, entry);
  }
  const current = entry;
  const listener = { event, fn };
  current.listeners.add(listener);
  if (onStatus) {
    current.statuses.add(onStatus);
    onStatus(current.connected);
  }
  return () => {
    current.listeners.delete(listener);
    if (onStatus) current.statuses.delete(onStatus);
    if (current.listeners.size === 0 && topics.get(topic) === current) {
      topics.delete(topic);
      current.stop();
    }
  };
}

function open(topic: string): Entry {
  const supabase = getBrowserClient();
  let channel: RealtimeChannel | null = null;
  let closed = false;
  const entry: Entry = {
    listeners: new Set(),
    statuses: new Set(),
    connected: false,
    stop: () => {
      closed = true;
      if (channel) void supabase.removeChannel(channel);
    },
  };
  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (closed || !data.session) return;
    supabase.realtime.setAuth(data.session.access_token);
    // A channel of this topic still closing (the last listener left a moment ago) is finished first.
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (stale) await supabase.removeChannel(stale);
    if (closed) return;
    channel = supabase
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: '*' }, (message: { event: string; payload?: Record<string, unknown> }) => {
        for (const l of entry.listeners) if (l.event === message.event) l.fn(message.payload ?? {});
      })
      .subscribe((status) => {
        entry.connected = status === 'SUBSCRIBED';
        entry.statuses.forEach((s) => s(entry.connected));
      });
  })();
  return entry;
}
