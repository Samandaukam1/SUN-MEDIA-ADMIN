import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/** One stored file: RLS decides whether this person may see it, then a short-lived download link. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data: file, error } = await supabase.from('files').select('name, bucket, storage_path, external_url').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error || !file) return new NextResponse('Fayl topilmadi', { status: 404 });
  if (file.external_url) return NextResponse.redirect(file.external_url);
  if (!file.bucket || !file.storage_path) return new NextResponse('Fayl topilmadi', { status: 404 });
  const { data, error: signError } = await supabase.storage.from(file.bucket).createSignedUrl(file.storage_path, 120, { download: file.name });
  if (signError || !data) return new NextResponse('Faylni ochib bo‘lmadi', { status: 403 });
  return NextResponse.redirect(data.signedUrl);
}
