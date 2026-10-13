import { NextResponse } from 'next/server';

import { getSessionContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * A file attached to a report. Row-level security decides: the partner reaches files of its own brand's
 * published reports only, SUN MEDIA staff those of brands they work with. Then a 2-minute download link.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context || context.status !== 'active') return new NextResponse('Avval kiring', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Fayl topilmadi', { status: 404 });
  const supabase = await createClient();
  const { data: file, error } = await supabase.from('monthly_report_files').select('name, storage_path').eq('id', id).maybeSingle();
  if (error || !file) return new NextResponse('Fayl topilmadi', { status: 404 });
  const { data, error: signError } = await supabase.storage.from('reports').createSignedUrl(file.storage_path, 120, { download: file.name });
  if (signError || !data) return new NextResponse('Faylni ochib bo‘lmadi', { status: 403 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
