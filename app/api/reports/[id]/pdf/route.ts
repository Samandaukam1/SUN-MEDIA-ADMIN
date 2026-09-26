import { NextResponse } from 'next/server';

import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/** Stored report PDF: a fresh short-lived download link, so the button can be a plain link (no popup blocking). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'reports.read') && !can(context, 'reports.manage')) return new NextResponse('Ruxsat yo‘q', { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from('monthly_reports')
    .select('pdf_path, period_month, client:clients(code)')
    .eq('id', id)
    .maybeSingle();
  if (error || !report?.pdf_path) return new NextResponse('PDF topilmadi', { status: 404 });
  const name = `SUNMEDIA-${report.client?.code ?? 'REPORT'}-${report.period_month.slice(0, 7)}.pdf`;
  const { data, error: signError } = await supabase.storage.from('reports').createSignedUrl(report.pdf_path, 120, { download: name });
  if (signError || !data) return new NextResponse('PDF ochilmadi', { status: 403 });
  return NextResponse.redirect(data.signedUrl);
}
