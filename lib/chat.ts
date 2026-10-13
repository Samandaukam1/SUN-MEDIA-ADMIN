import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

/** Panel chat reads, all through the signed-in person's session (the same RPCs and row-level security as the app). */

const chatSchema = z.object({
  room_id: z.string(),
  kind: z.enum(['project', 'internal', 'direct']),
  name: z.string().nullable(),
  client_id: z.string().nullable(),
  client_name: z.string().nullable(),
  client_logo: z.string().nullable(),
  archived: z.boolean().nullable(),
  muted: z.boolean().nullable(),
  member_count: z.coerce.number().nullable(),
  peer_id: z.string().nullable(),
  peer_name: z.string().nullable(),
  peer_avatar: z.string().nullable(),
  last_message_body: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_sender_name: z.string().nullable(),
  last_is_system: z.boolean().nullable(),
  last_has_files: z.boolean().nullable(),
  unread_count: z.coerce.number().nullable(),
});
export type MyChat = z.infer<typeof chatSchema>;

export async function loadMyChats(): Promise<MyChat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_chats');
  if (error) throw error;
  return z.array(chatSchema).parse(data ?? []);
}

const clientConversationSchema = z.object({
  room_id: z.string(),
  client_id: z.string(),
  client_name: z.string(),
  client_code: z.string().nullable(),
  client_logo: z.string().nullable(),
  last_message_body: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_sender_name: z.string().nullable(),
  awaiting_reply: z.boolean().nullable(),
  is_member: z.boolean().nullable(),
  unread_count: z.coerce.number().nullable(),
});
export type ClientConversation = z.infer<typeof clientConversationSchema>;

/** Every client's chat for people who moderate or observe client chats; null for everyone else. */
export async function loadClientConversations(): Promise<ClientConversation[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_client_conversations');
  if (error) {
    if (error.code === '42501') return null;
    throw error;
  }
  return z.array(clientConversationSchema).parse(data ?? []);
}

export type RoomInfo = {
  id: string;
  kind: 'project' | 'internal' | 'direct';
  title: string;
  subtitle: string;
  clientId: string | null;
  isMember: boolean;
  members: { id: string; name: string }[];
};

export async function loadRoom(roomId: string, userId: string): Promise<RoomInfo | null> {
  if (!z.uuid().safeParse(roomId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('chat_rooms')
    .select('id, kind, name, client_id, client:clients(id, name), members:chat_members(user_id, person:profiles(id, full_name))')
    .eq('id', roomId)
    .maybeSingle();
  if (!data) return null;
  const members = (data.members ?? []).map((m) => ({ id: m.user_id, name: m.person?.full_name ?? '—' }));
  const others = members.filter((m) => m.id !== userId);
  const title =
    data.kind === 'project' ? (data.client?.name ?? data.name ?? 'Mijoz') : data.kind === 'direct' ? (others[0]?.name ?? 'Suhbat') : (data.name ?? 'Guruh');
  const subtitle =
    data.kind === 'project'
      ? 'Mijoz bilan chat'
      : data.kind === 'direct'
        ? 'Shaxsiy yozishma'
        : `${members.length} a’zo`;
  return { id: data.id, kind: data.kind, title, subtitle, clientId: data.client_id, isMember: members.some((m) => m.id === userId), members };
}

/** Active SUN MEDIA colleagues for "new chat" / "new group" (the system owner included). */
export async function loadColleagues(userId: string): Promise<{ id: string; name: string; role: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, role:roles!inner(name, scope, rank), person:profiles!user_roles_user_id_fkey(id, full_name, status, deleted_at)')
    .eq('role.scope', 'staff');
  if (error) throw error;
  const seen = new Map<string, { id: string; name: string; role: string; rank: number }>();
  for (const r of data ?? []) {
    const p = r.person;
    if (!p || p.id === userId || p.status !== 'active' || p.deleted_at) continue;
    const prev = seen.get(p.id);
    if (!prev || r.role.rank < prev.rank) seen.set(p.id, { id: p.id, name: p.full_name, role: r.role.name, rank: r.role.rank });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ id, name, role }) => ({ id, name, role }));
}

/** Unread messages across the person's chats (muted and archived ones left out) — the sidebar badge. */
export function unreadTotal(chats: MyChat[]): number {
  return chats.filter((c) => !c.muted && !c.archived).reduce((n, c) => n + (c.unread_count ?? 0), 0);
}
