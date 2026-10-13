/** Where the viewer stands: the story of the row and the slide inside it, both counted from 0. */
export type Position = { story: number; slide: number }

/** Each slide stays this long before the next one comes, unless the visitor holds it. */
export const SLIDE_MS = 5000

/** The `sessionStorage` key of the stories this visitor has opened in this tab. */
export const SEEN_KEY = "upready.stories.seen"

/**
 * One slide on from `at`, `slides[i]` being the number of slides of story i: the next slide, then the next
 * story's first, then null, the end of the row, and the dialog closes. One back: the slide before, then the
 * story before from its start, and the first slide of the first story stays where it is.
 */
export function step(at: Position, direction: 1 | -1, slides: number[]): Position | null {
  if (direction === 1) {
    if (at.slide + 1 < slides[at.story]) return { story: at.story, slide: at.slide + 1 }
    return at.story + 1 < slides.length ? { story: at.story + 1, slide: 0 } : null
  }
  if (at.slide > 0) return { story: at.story, slide: at.slide - 1 }
  return { story: Math.max(0, at.story - 1), slide: 0 }
}

/** Where an arrow key takes the viewer: on or back, swapped on a right-to-left page. Null for any other key. */
export function keyDirection(key: string, rtl: boolean): 1 | -1 | null {
  if (key === "ArrowRight") return rtl ? -1 : 1
  if (key === "ArrowLeft") return rtl ? 1 : -1
  return null
}

/** Whether the slide moves on by itself now: not under reduced motion, and not while paused, pressed or hovered. */
export const advances = (state: { reduced: boolean; paused: boolean; pressed: boolean; hovered: boolean }) =>
  !state.reduced && !state.paused && !state.pressed && !state.hovered

/** The stories `sessionStorage` holds as seen; anything unreadable is none. */
export function readSeen(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : []
  } catch {
    return []
  }
}

/** The seen list with `key` added once, as `sessionStorage` keeps it. */
export const addSeen = (raw: string | null, key: string) => {
  const seen = readSeen(raw)
  return JSON.stringify(seen.includes(key) ? seen : [...seen, key])
}

/** `{index}` and `{count}` of a slide's name filled in; `index` counts from 0. */
export const nameSlide = (template: string, index: number, count: number) =>
  template.replaceAll("{index}", String(index + 1)).replaceAll("{count}", String(count))
