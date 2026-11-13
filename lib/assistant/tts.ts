import 'server-only';

import { geminiKey, geminiSpeech, geminiSpeechStream } from './gemini';
import { spokenText, textLanguage, type SpeechLang } from './speech';
import { isFixedPhrase, moodSsml, voiceAllowed, voiceCacheKey, type Mood } from './voice-profile';
import { cachedAudio, monthChars, recordVoice, sha, storeAudio, voiceConfig } from './voice-server';

/**
 * One piece of Sunny's speech. Azure neural TTS (uz-UZ-SardorNeural by default, uz-UZ-MadinaNeural if the voice is
 * refused) with the reply's mood as SSML prosody; Gemini's free TTS only as the configured fallback. Fixed phrases come
 * from the audio cache after their first synthesis. The month's characters are counted against the free quota: over
 * it Sunny goes text-only unless the owner allowed paid use. Nothing secret leaves the server.
 */
export type Synth =
  | { kind: 'audio'; body: ReadableStream<Uint8Array> | Buffer; type: string; provider: string; cached: boolean; firstByteMs: number | null; voice: string; spoken: string }
  | { kind: 'none'; reason: 'empty' | 'off' | 'quota' | 'failed' | 'aborted' };

export type SynthOverride = { voice?: string; rate?: number; pitch?: number; intensity?: number };

function voiceFor(lang: SpeechLang, uzVoice: string) {
  if (lang === 'ru-RU') return process.env.ASSISTANT_VOICE_RU || 'ru-RU-DmitryNeural';
  if (lang === 'en-US') return process.env.ASSISTANT_VOICE_EN || 'en-US-AndrewMultilingualNeural';
  return uzVoice;
}

export async function synthesize(o: { text: string; mood: Mood; stream: boolean; signal: AbortSignal; override?: SynthOverride }): Promise<Synth> {
  const { settings, lexicon, intensity: savedIntensity } = await voiceConfig();
  const { lang } = textLanguage(o.text);
  const spoken = spokenText(o.text, lang, lexicon);
  if (!spoken) return { kind: 'none', reason: 'empty' };
  if (!settings.enabled || settings.provider === 'off') return { kind: 'none', reason: 'off' };
  const base = { rate: o.override?.rate ?? settings.rate, pitch: o.override?.pitch ?? settings.pitch };
  const intensity = o.override?.intensity ?? savedIntensity;
  let voice = voiceFor(lang, o.override?.voice ?? settings.voice);
  const format = o.stream ? 'pcm' : 'mp3';
  const type = o.stream ? 'audio/pcm;rate=24000' : 'audio/mpeg';

  // Fixed phrases: one synthesis, then from the cache (bound to provider, voice, prosody, mood and text).
  const fixed = isFixedPhrase(o.text) && settings.provider === 'azure';
  const key = fixed ? voiceCacheKey({ provider: 'azure', voice, rate: base.rate, pitch: base.pitch, mood: o.mood, intensity, spoken, format }, sha) : null;
  if (key) {
    const hit = await cachedAudio(key);
    if (hit?.length) {
      await recordVoice('tts', 'azure', spoken.length, 0, true);
      return { kind: 'audio', body: hit, type, provider: 'azure', cached: true, firstByteMs: 0, voice, spoken };
    }
  }

  const allowed = voiceAllowed(settings, await monthChars(), spoken.length);
  if (!allowed.ok) return { kind: 'none', reason: allowed.reason };

  const key2 = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (settings.provider === 'azure' && key2 && region) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key2,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': o.stream ? 'raw-24khz-16bit-mono-pcm' : 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'sunmedia-assistant',
        },
        body: moodSsml(spoken, { lang, voice, mood: o.mood, base, intensity }),
        signal: AbortSignal.any([o.signal, AbortSignal.timeout(20_000)]),
      }).catch(() => null);
      if (o.signal.aborted) return { kind: 'none', reason: 'aborted' };
      if (res?.ok && res.body) {
        const firstByteMs = Date.now() - t0;
        await recordVoice('tts', 'azure', spoken.length);
        if (key) {
          // A fixed phrase is short: keep the whole clip for next time, then play it.
          const bytes = Buffer.from(await res.arrayBuffer());
          if (bytes.length) await storeAudio(key, bytes, o.stream ? 'application/octet-stream' : 'audio/mpeg');
          return { kind: 'audio', body: bytes, type, provider: 'azure', cached: false, firstByteMs, voice, spoken };
        }
        return { kind: 'audio', body: res.body, type, provider: 'azure', cached: false, firstByteMs, voice, spoken };
      }
      console.error('[assistant] Azure TTS', res?.status ?? 'network');
      // The chosen Uzbek voice refused (unsupported or retired): the fallback voice reads it once.
      if (res?.status === 400 && lang === 'uz-UZ' && voice !== settings.fallbackVoice && attempt === 0) {
        voice = settings.fallbackVoice;
        continue;
      }
      break;
    }
  }
  // Gemini's free TTS: when it is the configured provider, or Azure is unavailable (never a paid service).
  if (geminiKey()) {
    const playful = o.mood === 'mischievous' || o.mood === 'sarcastic';
    const t0 = Date.now();
    const live = o.stream ? await geminiSpeechStream(spoken, lang, o.signal, playful) : null;
    if (live) {
      await recordVoice('tts', 'gemini', spoken.length);
      return { kind: 'audio', body: live.stream, type: `audio/pcm;rate=${live.rate}`, provider: 'gemini', cached: false, firstByteMs: Date.now() - t0, voice: 'gemini', spoken };
    }
    if (o.signal.aborted) return { kind: 'none', reason: 'aborted' };
    const audio = await geminiSpeech(spoken, lang, playful);
    if (audio) {
      await recordVoice('tts', 'gemini', spoken.length);
      return { kind: 'audio', body: audio.body, type: audio.type, provider: 'gemini', cached: false, firstByteMs: Date.now() - t0, voice: 'gemini', spoken };
    }
  }
  return { kind: 'none', reason: 'failed' };
}
