import 'server-only';

import type { FocusSeen, PageFocus } from './context';
import type { AssistantContext } from './tools';

const TZ = 'Asia/Tashkent';
const at = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('uz-UZ', { timeZone: TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(', ');

/**
 * Sunny Vision (§28): the record on the person's screen, looked up with their own session (row-level security), so a
 * page they cannot open — or a forged id — resolves to nothing. Only a name and a few plain facts, never private fields.
 */
export async function seeFocus(ctx: AssistantContext, focus?: PageFocus | null): Promise<FocusSeen | null> {
  if (!focus || !ctx.db || ctx.audience === 'public') return null;
  const db = ctx.db;
  const one = { kind: focus.kind, id: focus.id };
  try {
    switch (focus.kind) {
      case 'task': {
        const { data } = await db.from('tasks').select('title, status, due_at, client:clients(name)').eq('id', focus.id).is('deleted_at', null).maybeSingle();
        const t = data as { title: string; status: string; due_at: string | null; client: { name: string } | null } | null;
        return t ? { ...one, label: t.title, facts: join(t.client?.name, `holat ${t.status}`, t.due_at && `muddat ${at(t.due_at)}`) } : null;
      }
      case 'client': {
        const { data } = await db.from('clients').select('name').eq('id', focus.id).is('deleted_at', null).maybeSingle();
        return data ? { ...one, label: data.name } : null;
      }
      case 'content': {
        const { data } = await db.from('content_items').select('title, status, post_at, client:clients(name)').eq('id', focus.id).is('deleted_at', null).maybeSingle();
        const c = data as { title: string; status: string; post_at: string | null; client: { name: string } | null } | null;
        return c ? { ...one, label: c.title, facts: join(c.client?.name, `holat ${c.status}`, c.post_at && `post ${at(c.post_at)}`) } : null;
      }
      case 'shooting': {
        const { data } = await db.from('shootings').select('title, starts_at, location_name, client:clients(name)').eq('id', focus.id).is('deleted_at', null).maybeSingle();
        const sh = data as { title: string; starts_at: string | null; location_name: string | null; client: { name: string } | null } | null;
        return sh ? { ...one, label: sh.title, facts: join(sh.client?.name, at(sh.starts_at), sh.location_name) } : null;
      }
      case 'chat': {
        const { data } = await db.from('chat_rooms').select('name, kind, client:clients(name)').eq('id', focus.id).maybeSingle();
        const r = data as { name: string | null; kind: string; client: { name: string } | null } | null;
        return r ? { ...one, label: r.kind === 'project' ? (r.client?.name ?? r.name ?? 'Loyiha chati') : (r.name ?? 'Chat'), facts: r.kind === 'project' ? 'hamkor loyiha chati' : r.kind === 'internal' ? 'jamoa chati' : undefined } : null;
      }
      case 'person': {
        const { data } = await db.from('profiles').select('full_name').eq('id', focus.id).maybeSingle();
        return data?.full_name ? { ...one, label: data.full_name } : null;
      }
    }
  } catch {
    // Not readable: Sunny asks which one instead of guessing.
  }
  return null;
}
