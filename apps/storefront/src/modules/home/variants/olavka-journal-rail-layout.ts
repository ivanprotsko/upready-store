/**
 * The numbers of the «Журнал здоровья» rail that both the server component and its tests
 * read. Plain data, no JSX.
 */

/** The widest rail shows four cards in a row: the last `--n` of `olavka-journal-rail.module.css`. */
export const JOURNAL_RAIL_PER_VIEW = 4

/** The newest articles the rail carries: one page of the journal feed. */
export const JOURNAL_RAIL_LIMIT = 12

export type JournalRailCopy = "before" | "real" | "after"

/**
 * The copies of the article list the rail renders. It loops, clone · real · clone, only
 * with more articles than the widest row shows: a shop with three articles would otherwise
 * show the same card twice side by side.
 */
export const journalRailCopies = (count: number): readonly JournalRailCopy[] =>
  count > JOURNAL_RAIL_PER_VIEW ? ["before", "real", "after"] : ["real"]
