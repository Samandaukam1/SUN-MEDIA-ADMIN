// Supabase clients for Edge Functions: the service role (tokens, ingestion) and the caller's own session (every
// user-facing action is authorized by the database with the caller's rights).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Service = SupabaseClient;

export function serviceClient(): Service {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the signed-in admin (Authorization: Bearer <access token>), or null without a token. */
export function userClient(req: Request): SupabaseClient | null {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

type Context = { status?: string; kind?: string; permissions?: string[]; profile?: { id?: string } };

/** The caller's id when they are active staff holding `permission` (the Tizim egasi holds every permission). */
export async function staffWith(client: SupabaseClient, permission: string): Promise<string | null> {
  const { data, error } = await client.rpc('get_my_context');
  if (error || !data) return null;
  const ctx = data as Context;
  if (ctx.status !== 'active' || ctx.kind !== 'staff' || !ctx.permissions?.includes(permission)) return null;
  return ctx.profile?.id ?? null;
}

export async function readToken(service: Service, kind: 'connection' | 'asset', id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await service.rpc('meta_read_token', { p_owner_kind: kind, p_owner_id: id });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** Background work after the response (Supabase Edge Runtime), or inline where unavailable. */
export function background(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise.catch((e) => console.error(e)));
  else promise.catch((e) => console.error(e));
}
