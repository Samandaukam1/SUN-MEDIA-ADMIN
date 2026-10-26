import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getSessionContext } from '@/lib/auth';
import { homeFor } from '@/lib/cabinet/routing';
import { safeRoute, webPath, type Area } from '@/lib/pwa/routes';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Opened = { route?: string | null; entity_type?: string | null; entity_id?: string | null; client_id?: string | null };

/**
 * Where a notification click (or an app shortcut) lands: /open?n=<notification> or /open?r=<app route>.
 * Signed out → the sign-in, then back here (the middleware keeps the address). Signed in → the click is recorded,
 * the notification is marked read (the chat itself is read when it is opened) and the person's own page for it opens.
 * Someone else's notification id opens nothing but the person's home.
 */
export async function GET(request: NextRequest) {
  const context = await getSessionContext().catch(() => null);
  const area = homeFor(context) as Area | null;
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url), { status: 303 });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  };
  if (!context || !area) return go('/?kirish=1');
  if (context.temporary_password) return go('/parol');

  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  let target: Opened = { route: safeRoute(params.get('r')) };

  const id = z.uuid().safeParse(params.get('n'));
  if (id.success) {
    const { data, error } = await supabase.rpc('open_notification' as never, { p_id: id.data } as never);
    if (!error) target = (data as Opened | null) ?? {};
    else {
      // Before the web-push migration: the same, without the click time.
      const { data: row } = await supabase.from('notifications').select('data, entity_type, entity_id, client_id').eq('id', id.data).maybeSingle();
      if (row) {
        await supabase.rpc('mark_notifications_read', { p_ids: [id.data] });
        target = { route: (row.data as { route?: string } | null)?.route ?? null, entity_type: row.entity_type, entity_id: row.entity_id, client_id: row.client_id };
      }
    }
  }

  const route = safeRoute(target.route);
  if (!route) return go(area);
  type Kind = 'internal' | 'project' | 'direct';
  let chatKind: Kind | null = null;
  const room = /^\/chat\/([0-9a-f-]{36})$/i.exec(route)?.[1];
  if (room && area === '/panel') {
    const { data } = await supabase.from('chat_rooms').select('kind').eq('id', room).maybeSingle();
    chatKind = (data?.kind as Kind | undefined) ?? null;
  }
  return go(webPath({ route, area, chatKind, clientId: target.client_id ?? null }));
}
