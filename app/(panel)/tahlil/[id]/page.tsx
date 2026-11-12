import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ProspectStudio, type StudioAnalysis } from '@/components/prospects/ProspectStudio';
import { aiConfigured } from '@/lib/ai';
import { cleanAnswers } from '@/lib/prospects/questions';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Mijoz tahlili' };
// The AI reads the interview or the profile screenshots: allow it time to answer.
export const maxDuration = 120;

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [{ data: prospect, error }, { data: analyses, error: analysesError }, { data: interviews }] = await Promise.all([
    supabase.from('prospects').select('id, name, company, phone, instagram, status, answers, notes, created_at').eq('id', id).maybeSingle(),
    supabase.from('prospect_analyses').select('id, kind, input, result, model, created_at').eq('prospect_id', id).order('created_at', { ascending: false }).limit(40),
    supabase.from('brief_sessions').select('id, status, completed_at, created_at').eq('prospect_id', id).order('created_at', { ascending: false }).limit(5),
  ]);
  if (error) throw error;
  if (analysesError) throw analysesError;
  if (!prospect) notFound();

  const studio = (
    <ProspectStudio
      prospect={{ ...prospect, answers: cleanAnswers(prospect.answers) }}
      analyses={(analyses ?? []) as StudioAnalysis[]}
      aiReady={aiConfigured()}
    />
  );
  if (!interviews?.length) return studio;
  // A client who answered the interview: their real report is there — this card holds the Instagram analysis.
  return (
    <div className="space-y-6">
      <div className="rounded-[22px] border border-[#d4fc18]/30 bg-[#d4fc18]/[0.06] p-5">
        <p className="text-[15px] font-semibold text-white">Bu mijoz suhbatdan o‘tgan</p>
        <p className="mt-1 text-[13.5px] text-[#a8a8ac]">Javoblar, AI tahlili, xulosa va sayt talablari suhbat hisobotida. Bu kartada Instagram tahlili va eslatmalar.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {interviews.map((s, i) => (
            <Link key={s.id} href={`/tahlil/suhbat/${s.id}`} className="h-10 rounded-full bg-[#d4fc18] px-5 text-[13.5px] leading-10 font-semibold text-[#0b0b0c]">
              {i === 0 ? 'Suhbat hisobotini ochish' : `Avvalgi suhbat (${s.status === 'completed' ? 'yakunlangan' : 'tugallanmagan'})`}
            </Link>
          ))}
        </div>
      </div>
      {studio}
    </div>
  );
}
