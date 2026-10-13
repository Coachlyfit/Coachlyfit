/** Limits for voice notes, shared by the recorder, the send action and the
 * cleanup cron. The bucket and the messages check constraint in
 * 20261021000001_voice_notes.sql enforce the same size, types and duration;
 * change them together. */
export const VOICE_NOTES_BUCKET = "voice-notes";
/** Files are deleted this long after upload; the message row stays. */
export const VOICE_NOTE_RETENTION_DAYS = 30;
export const VOICE_NOTE_MAX_SECONDS = 120;
export const VOICE_NOTE_MIN_SECONDS = 1;
export const VOICE_NOTE_MAX_BYTES = 512_000;
/** ~180 KB per minute, so a full-length note fits the byte cap. */
export const VOICE_NOTE_BITRATE = 24_000;

export const VOICE_MIME_EXT = { "audio/webm": "webm", "audio/mp4": "mp4" } as const;
export type VoiceMime = keyof typeof VOICE_MIME_EXT;

/** A recorder reports its type with parameters ("audio/webm;codecs=opus"). */
export function normalizeVoiceMime(type: string): VoiceMime | null {
  const base = type.split(";")[0].trim().toLowerCase();
  return base in VOICE_MIME_EXT ? (base as VoiceMime) : null;
}

/** The container the bytes actually are, from the file's first 12 bytes:
 * the declared type is whatever the sender says it is. */
export function sniffVoiceMime(head: Uint8Array): VoiceMime | null {
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "audio/webm";
  // ISO base media: a box size, then "ftyp".
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "audio/mp4";
  return null;
}
