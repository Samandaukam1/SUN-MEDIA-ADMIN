'use client';

import { getPublicEnv } from '@/lib/env';
import { getBrowserClient } from '@/lib/supabase/client';

export { clock, messagePreview, toWaveform } from './format';

/**
 * Voice and round video messages: what this browser can record, the Uzbek errors, one player at a time, and the send
 * (create the file row → upload → confirm → send_media_message), resumable after a failure without a second message.
 */

export type MediaKind = 'voice' | 'round_video';

/** The same limits as app_settings chat.* — the database checks them again. */
export const LIMITS = {
  voiceMaxMs: 10 * 60_000,
  videoMaxMs: 60_000,
  maxBytes: 50 * 1024 * 1024,
  /** Shorter than this is a slip of the finger, not a message. */
  minMs: 700,
};

export const TEXT = {
  micDenied: 'Mikrofondan foydalanishga ruxsat berilmagan.',
  camDenied: 'Kameradan foydalanishga ruxsat berilmagan.',
  micMissing: 'Mikrofon topilmadi.',
  camMissing: 'Kamera topilmadi.',
  micBusy: 'Mikrofon boshqa ilovada band. Uni yopib, qayta urinib ko‘ring.',
  camBusy: 'Kamera boshqa ilovada band. Uni yopib, qayta urinib ko‘ring.',
  unsupported: 'Qurilmangizda bu yozib olish usuli qo‘llab-quvvatlanmaydi.',
  tooLarge: 'Xabar hajmi ruxsat etilgan chegaradan oshdi.',
  failed: 'Xabarni yuborib bo‘lmadi. Qayta urinib ko‘ring.',
  noRights: 'Bu chatga yozish huquqingiz yo‘q (faqat kuzatasiz).',
  empty: 'Yozuv bo‘sh chiqdi. Qayta yozib ko‘ring.',
  tooShort: 'Juda qisqa. Bosib turing yoki bir marta bosib yozing.',
};

/** Best-playable first: MP4 (AAC / H.264) plays on every target, WebM is the fallback where MP4 cannot be recorded. */
const TYPES: Record<MediaKind, string[]> = {
  voice: ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'],
  round_video: [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ],
};

export function canRecord(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

/** The container this browser really records ('' = its own default; null = nothing usable). */
export function pickMime(kind: MediaKind): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return TYPES[kind].find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export const baseMime = (mime: string, kind: MediaKind) => mime.split(';')[0].trim().toLowerCase() || (kind === 'voice' ? 'audio/mp4' : 'video/mp4');

const extOf = (mime: string) => (mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.startsWith('audio/') ? 'm4a' : 'mp4');

/** getUserMedia / MediaRecorder failures in plain Uzbek. */
export function deviceError(error: unknown, kind: MediaKind): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  const voice = kind === 'voice';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) return voice ? TEXT.micDenied : TEXT.camDenied;
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name)) return voice ? TEXT.micMissing : TEXT.camMissing;
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(name)) return voice ? TEXT.micBusy : TEXT.camBusy;
  return TEXT.unsupported;
}

// ---------------------------------------------------------------------------------------------------------------
// One voice / video message plays at a time; a new recording silences whatever plays.
// ---------------------------------------------------------------------------------------------------------------
let playing: HTMLMediaElement | null = null;
export function claimPlayback(el: HTMLMediaElement) {
  if (playing && playing !== el) playing.pause();
  playing = el;
}
export function releasePlayback(el: HTMLMediaElement) {
  if (playing === el) playing = null;
}
export function stopPlayback() {
  playing?.pause();
  playing = null;
}

// ---------------------------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------------------------
export type Draft = { kind: MediaKind; blob: Blob; mime: string; durationMs: number; width?: number; height?: number; waveform?: number[] };

/** How far a send got: a retry continues from here (same file row, no second upload, no second message). */
export type Attempt = { fileId?: string; bucket?: string; path?: string; uploaded?: boolean; completed?: boolean; sent?: boolean };

export class MediaError extends Error {}

/** Storage upload with progress (supabase-js has none); "already there" counts as done — an earlier try landed. */
async function upload(bucket: string, path: string, blob: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  const { data } = await getBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new MediaError(TEXT.failed);
  const { url, key } = getPublicEnv();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${url}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', key);
    xhr.setRequestHeader('Content-Type', type);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status < 300 || xhr.status === 409 || /Duplicate|already exists/i.test(xhr.responseText)
        ? resolve()
        : reject(new MediaError(xhr.status === 413 ? TEXT.tooLarge : TEXT.failed));
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new MediaError(TEXT.failed));
    xhr.send(blob);
  });
}

export async function sendMedia(roomId: string, draft: Draft, attempt: Attempt, replyTo: string | null, onProgress: (p: number) => void): Promise<void> {
  if (!draft.blob.size) throw new MediaError(TEXT.empty);
  if (draft.blob.size > LIMITS.maxBytes) throw new MediaError(TEXT.tooLarge);
  const supabase = getBrowserClient();
  if (!attempt.fileId) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const { data: row, error } = await supabase.rpc('create_file_upload', {
      p_name: `${draft.kind === 'voice' ? 'ovozli-xabar' : 'video-xabar'}-${stamp}.${extOf(draft.mime)}`,
      p_mime_type: draft.mime,
      p_size_bytes: draft.blob.size,
      p_chat_room_id: roomId,
    });
    if (error || !row?.bucket || !row.storage_path) throw new MediaError(error?.code === '42501' ? TEXT.noRights : error?.code === '22023' ? TEXT.tooLarge : TEXT.failed);
    Object.assign(attempt, { fileId: row.id, bucket: row.bucket, path: row.storage_path });
  }
  if (!attempt.uploaded) {
    await upload(attempt.bucket!, attempt.path!, draft.blob, draft.mime, onProgress);
    attempt.uploaded = true;
  }
  onProgress(1);
  if (!attempt.completed) {
    const { error } = await supabase.rpc('complete_file_upload', {
      p_file_id: attempt.fileId!,
      p_duration_ms: Math.round(draft.durationMs),
      p_width: draft.width,
      p_height: draft.height,
    });
    if (error) throw new MediaError(TEXT.failed);
    attempt.completed = true;
  }
  const { error } = await supabase.rpc('send_media_message', {
    p_room_id: roomId,
    p_file_id: attempt.fileId!,
    p_kind: draft.kind,
    p_waveform: draft.waveform?.length ? draft.waveform : undefined,
    p_reply_to: replyTo ?? undefined,
  });
  if (error) throw new MediaError(error.code === '42501' ? TEXT.noRights : error.message?.includes('too large') ? TEXT.tooLarge : TEXT.failed);
  attempt.sent = true;
}

/** The person gave up on a failed send: the half-sent upload is removed too (best effort; it was never visible). */
export async function discardAttempt(attempt: Attempt): Promise<void> {
  if (!attempt.fileId || attempt.sent) return;
  const supabase = getBrowserClient();
  if (attempt.uploaded && attempt.bucket && attempt.path) await supabase.storage.from(attempt.bucket).remove([attempt.path]).catch(() => undefined);
  await supabase.rpc('discard_chat_upload', { p_file_id: attempt.fileId }).then(
    () => undefined,
    () => undefined,
  );
}
