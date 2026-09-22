/**
 * Strip the HTML an imported description sometimes arrives wrapped in, keeping
 * the line structure the tags carried: `<br>` and the end of a block element
 * each become a newline, and the entities a scraper leaves behind become their
 * characters. Runs of three or more newlines collapse to one blank line, so a
 * source with generous spacing does not open a hole in the page.
 *
 * Shared by the full description block and the three-line excerpt in the
 * product card, so the two never disagree on what the text says.
 */
export const stripHtml = (html: string) =>
  html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/** The paragraphs of a stripped description: blank-line separated, empties dropped. */
export const descriptionParagraphs = (description: string) =>
  description.split(/\n{2,}/).filter(Boolean)
