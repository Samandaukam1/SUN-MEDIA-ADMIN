import { NextResponse } from 'next/server';

import { getSessionContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/** A published report's PDF for the partner (row-level security: own brand, published only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSessionContext();
  if (!context || context.status !== 'active') return new NextResponse('Avval kiring', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('PDF topilmadi', { status: 404 });
  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from('monthly_reports')
    .select('pdf_path, period_month, status, client:clients(code)')
    .eq('id', id)
    .maybeSingle();
  if (error || !report?.pdf_path) return new NextResponse('PDF topilmadi', { status: 404 });
  const name = `SUNMEDIA-${report.client?.code ?? 'REPORT'}-${report.period_month.slice(0, 7)}.pdf`;
  const { data, error: signError } = await supabase.storage.from('reports').createSignedUrl(report.pdf_path, 120, { download: name });
  if (signError || !data) return new NextResponse('PDF ochilmadi', { status: 403 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
