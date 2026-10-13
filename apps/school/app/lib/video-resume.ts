/**
 * Where the buyer stopped a lesson's video, kept in the browser's
 * localStorage per lesson and per video, so a long recording («Травяной
 * метод» runs 1 h 43 min) opens where it was left.
 */

export const resumeKey = (lessonId: string, index: number) => `school:video:${lessonId}:${index}`

/** Closer to either end than this, the video starts over instead. */
const MARGIN_SEC = 5

/** The second to seek to, or null to start from the beginning. */
export function resumeAt(saved: string | null, duration: number): number | null {
  const at = saved === null ? Number.NaN : Number(saved)

  if (!Number.isFinite(at) || at < MARGIN_SEC) {
    return null
  }

  if (Number.isFinite(duration) && duration > 0 && at > duration - MARGIN_SEC) {
    return null
  }

  return at
}

/** Saves at most once per this many seconds of playback. */
export const SAVE_EVERY_SEC = 5

export type ResumeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** localStorage, or null where it is missing or refuses (Safari's private mode). */
export function browserStorage(): ResumeStorage | null {
  try {
    const storage = window.localStorage
    const probe = "school:probe"
    storage.setItem(probe, "1")
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}
