import type { Metadata } from 'next';

import { PageHeader } from '@/components/panel/PageHeader';
import { SunnyVoiceStudio } from '@/components/settings/SunnyVoiceStudio';
import { Card } from '@/components/ui/Card';
import { voiceSettings, sttSettings } from '@/lib/assistant/voice-profile';
import { VOICE_SAMPLES } from '@/lib/assistant/voice-samples';
import { requireSystemOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sunny ovozi va uslubi' };

/** Sozlamalar → Sunny ovozi va uslubi (system owner only): Voice Test Studio, voice and style profile, pronunciation. */
export default async function SunnyVoicePage() {
  await requireSystemOwner();
  const supabase = await createClient();
  const [settings, personality, lexicon, usage] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'assistant.voice').maybeSingle(),
    supabase.from('assistant_personality').select('*').eq('id', 1).maybeSingle(),
    supabase.from('assistant_pronunciations').select('id, word, say_as').order('word').limit(500),
    supabase.rpc('assistant_voice_month'),
  ]);
  const p = (personality.data ?? {}) as Record<string, unknown>;
  const rows = usage.data ?? [];
  const sum = (kind: string, f: 'chars' | 'requests' | 'cached' | 'audio_ms') => rows.filter((r) => r.kind === kind).reduce((n, r) => n + Number(r[f]), 0);
  return (
    <div>
      <PageHeader title="Sunny ovozi va uslubi" description="Haqiqiy ovozni sinash, kayfiyatlar, talaffuz lug‘ati, uslub profili va bepul kvotalar." />
      <Card>
        <SunnyVoiceStudio
          voice={voiceSettings(process.env, settings.data?.value ?? null)}
          style={{
            sarcasm: Number(p.sarcasm ?? 0.2),
            qitmir_intensity: Number(p.qitmir_intensity ?? 2),
            phrases: String(p.phrases ?? ''),
            avoid_phrases: String(p.avoid_phrases ?? ''),
            reply_length: String(p.reply_length ?? 'short'),
            learn_from_feedback: !!p.learn_from_feedback,
          }}
          samples={VOICE_SAMPLES}
          lexicon={lexicon.data ?? []}
          usage={{ ttsChars: sum('tts', 'chars'), ttsCached: sum('tts', 'cached'), ttsRequests: sum('tts', 'requests'), sttMs: sum('stt', 'audio_ms'), sttRequests: sum('stt', 'requests'), sttCap: sttSettings(process.env).monthlyMs }}
        />
      </Card>
    </div>
  );
}
