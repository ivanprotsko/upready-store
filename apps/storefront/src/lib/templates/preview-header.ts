/**
 * The template preview's switch and its one request header (t-2026-10-12-33). Pure, no
 * Next imports: `middleware.ts` runs it on every request, the server reads the header back
 * through `./preview.ts`.
 *
 * `STOREFRONT_TEMPLATE_PREVIEW=1` is set on the templates stand only. Anywhere else the
 * header is deleted from every request and never written, so a visitor cannot ask for a
 * template by sending it themselves, and the server side returns before it reads a thing.
 */

export const TEMPLATE_PREVIEW_HEADER = "x-template-preview"

/** `?template=<id>` on any page of the shop. */
export const TEMPLATE_PREVIEW_PARAM = "template"

const TEMPLATE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function templatePreviewEnabled(): boolean {
  return process.env.STOREFRONT_TEMPLATE_PREVIEW === "1"
}

/** Drops whatever the visitor sent under the header, then writes the asked-for id if the flag is on. */
export function applyTemplatePreview(url: { searchParams: URLSearchParams }, headers: Headers): void {
  headers.delete(TEMPLATE_PREVIEW_HEADER)
  if (!templatePreviewEnabled()) return
  const id = url.searchParams.get(TEMPLATE_PREVIEW_PARAM)
  if (id && id.length <= 64 && TEMPLATE_ID.test(id)) headers.set(TEMPLATE_PREVIEW_HEADER, id)
}
