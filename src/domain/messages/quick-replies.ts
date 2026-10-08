/** Canned coach replies offered above the composer. A fixed list for now —
 * the wording lives in messages/{ar,en}.json under inbox.quickReplies, keyed
 * by these. Not stored per coach, so there is nothing to fetch. */
export const QUICK_REPLY_KEYS = ["greatWork", "sendPhotos", "checkinReminder"] as const;

export type QuickReplyKey = (typeof QUICK_REPLY_KEYS)[number];
