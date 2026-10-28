import 'server-only';

import { unstable_cache } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import type { AssistantContext } from './tools';
import { memoryPrompt, relevantExamples, stylePrompt, type Dials, type MemoryNote, type StyleExample } from './persona';

/**
 * What goes into the system prompt from Sunny's memory (phase 5). A person's notes are read with their own session:
 * row-level security returns only their personal notes, the company rules (staff) and the partner notes they may see.
 * Public visitors have no memory.
 */
export async function memoryContext(ctx: AssistantContext): Promise<string> {
  if (!ctx.db || !ctx.userId) return '';
  const { data, error } = await ctx.db.from('assistant_memories').select('scope, body').order('updated_at', { ascending: false }).limit(40);
  if (error || !data?.length) return '';
  return memoryPrompt(data as MemoryNote[]);
}

/**
 * The owner's dials and style examples. Read with the server key (they hold no personal data; only the system owner can
 * write them), cached for a few minutes and refreshed as soon as the owner changes them.
 */
const styleData = unstable_cache(
  async (): Promise<{ dials: Dials | null; examples: StyleExample[] }> => {
    try {
      const db = createAdminClient();
      const [dials, examples] = await Promise.all([
        db.from('assistant_personality').select('humor, mischief, formality, brevity, expressiveness, directness').eq('id', 1).maybeSingle(),
        db.from('assistant_style_examples').select('situation, answer').order('created_at', { ascending: false }).limit(60),
      ]);
      return { dials: (dials.data as Dials | null) ?? null, examples: examples.data ?? [] };
    } catch {
      // Not migrated yet, or no server key: Sunny's usual manner.
      return { dials: null, examples: [] };
    }
  },
  ['assistant-style-v2'],
  { revalidate: 300, tags: ['assistant-style'] },
);

/** The style for this question: the dials, and the five examples that fit it best. */
export async function styleContext(question = ''): Promise<string> {
  const { dials, examples } = await styleData();
  return stylePrompt(dials, relevantExamples(examples, question));
}
