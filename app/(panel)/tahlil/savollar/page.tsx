import type { Metadata } from 'next';
import Link from 'next/link';

import { QuestionBank, type BankItem } from '@/components/brief/QuestionBank';
import { display, Eyebrow } from '@/components/prospects/ui';
import { parseStoredQuestion } from '@/lib/brief/bank-schema';
import { builtinBank } from '@/lib/brief/engine';
import { INDUSTRIES } from '@/lib/brief/industries';
import type { Question } from '@/lib/brief/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Savollar banki' };

/** The expert question bank: the built-in library with every manager edit (newest version wins, older kept). */
export default async function QuestionBankPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('brief_question_versions').select('key, version, definition, active, note, created_at').order('version', { ascending: false }).limit(3000);
  if (error) throw error;

  const builtin = builtinBank();
  const versions = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) versions.set(r.key, [...(versions.get(r.key) ?? []), r]);
  const items: BankItem[] = [];
  const latestOf = (key: string): Question | null => {
    for (const r of versions.get(key) ?? []) {
      const q = parseStoredQuestion(r.definition, r.version, r.active);
      if (q) return q;
    }
    return null;
  };
  const meta = (key: string) => (versions.get(key) ?? []).map((v) => ({ version: v.version, active: v.active, note: v.note, created_at: v.created_at }));
  for (const b of builtin) {
    const e = latestOf(b.key);
    items.push(e && e.version > b.version ? { ...e, origin: 'edited', versions: meta(b.key) } : { ...b, origin: 'builtin', versions: meta(b.key) });
  }
  for (const key of versions.keys()) {
    if (builtin.some((b) => b.key === key)) continue;
    const e = latestOf(key);
    if (e) items.push({ ...e, origin: 'new', versions: meta(key) });
  }

  return (
    <div className="space-y-6">
      <Link href="/tahlil" className="inline-flex text-[13px] text-[#8e8e96] hover:text-[#d4fc18]">
        ← Mijoz tahlili
      </Link>
      <div>
        <Eyebrow>Mijoz tahlili</Eyebrow>
        <h1 className={`${display} mt-3 text-[30px] leading-[1.08] font-medium text-white sm:text-[40px]`}>Savollar banki</h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-[#a8a8ac]">
          Har bir savolning biznes maqsadi, sohasi, ustuvorligi va sharti bor. Dvigatel ularni mijozning sohasi va oldingi javoblariga qarab tanlaydi.
        </p>
      </div>
      <QuestionBank items={items} industries={INDUSTRIES.map((i) => ({ key: i.key, label: i.label }))} />
    </div>
  );
}
