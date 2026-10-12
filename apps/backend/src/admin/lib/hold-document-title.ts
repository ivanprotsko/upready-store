/**
 * Keeps the tab title at `title` until the returned function is called
 * (t-2026-10-12-32 FX3).
 *
 * The dashboard writes `document.title` itself through react-helmet-async, a
 * frame after it renders, so a title set once from an effect is overwritten.
 * The observer puts it back after every change in `<head>`, and it writes only
 * when the title differs, so its own write does not trigger another.
 */
export function holdDocumentTitle(
  title: string,
  doc: Pick<Document, "title" | "head"> = document,
  Observer: typeof MutationObserver = MutationObserver
): () => void {
  const hold = () => {
    if (doc.title !== title) {
      doc.title = title
    }
  }

  hold()
  const observer = new Observer(hold)
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true })

  return () => observer.disconnect()
}
