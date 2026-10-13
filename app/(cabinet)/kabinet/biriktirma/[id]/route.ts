import { NextResponse, type NextRequest } from 'next/server';

import { getSessionContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * A chat attachment for the partner cabinet: row-level security only returns files of chats this person is in;
 * then a 5-minute link (shown inline for pictures, downloaded with ?yuklab=1).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context || context.status !== 'active') return new NextResponse('Avval kiring', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Fayl topilmadi', { status: 404 });
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('files')
    .select('name, bucket, storage_path, external_url, chat_room_id')
    .eq('id', id)
    .eq('status', 'uploaded')
    .is('deleted_at', null)
    .maybeSingle();
  if (!file || !file.chat_room_id || !file.bucket || !file.storage_path) return new NextResponse('Fayl topilmadi', { status: 404 });
  const download = request.nextUrl.searchParams.get('yuklab') === '1';
  const { data, error } = await supabase.storage.from(file.bucket).createSignedUrl(file.storage_path, 300, download ? { download: file.name } : undefined);
  if (error || !data) return new NextResponse('Faylni ochib bo‘lmadi', { status: 403 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
