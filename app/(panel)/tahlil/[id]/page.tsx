import type { Metadata } from 'next';
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
  const [{ data: prospect, error }, { data: analyses, error: analysesError }] = await Promise.all([
    supabase.from('prospects').select('id, name, company, phone, instagram, status, answers, notes, created_at').eq('id', id).maybeSingle(),
    supabase.from('prospect_analyses').select('id, kind, input, result, model, created_at').eq('prospect_id', id).order('created_at', { ascending: false }).limit(40),
  ]);
  if (error) throw error;
  if (analysesError) throw analysesError;
  if (!prospect) notFound();

  return (
    <ProspectStudio
      prospect={{ ...prospect, answers: cleanAnswers(prospect.answers) }}
      analyses={(analyses ?? []) as StudioAnalysis[]}
      aiReady={aiConfigured()}
    />
  );
}
