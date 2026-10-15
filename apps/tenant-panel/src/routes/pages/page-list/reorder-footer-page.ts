import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"
import { pagesQueryKeys, TenantPage } from "../../../hooks/api/pages"
import { moveInFooter } from "../page-sections"

// t05-page-keys: moves a footer link one step. Plain function rather than a
// hook — a move touches rows the calling «…» never mounted a
// `useUpdateTenantPage` for — so it goes straight through the same
// `sdk.client` every hook in `hooks/api/pages.tsx` uses, and invalidates the
// one list query the whole screen reads from once the writes land.
//
// t-2026-10-14-01 (G4): every link gets its place 1, 2, 3 … (`moveInFooter`)
// instead of two pages swapping their values, which did nothing when both had
// none. Each write names the row's own `locale`: without it the backend saves
// the `en` row (`DEFAULT_PAGE_LOCALE`), and a Russian shop's footer, read from
// the `ru` rows, never moved.

const putPage = (page: TenantPage, footerOrder: number) =>
  sdk.client.fetch(`/tenants/pages/${page.key}`, {
    method: "PUT",
    body: {
      title: page.title,
      body: page.body,
      published: page.published,
      in_footer: page.in_footer,
      footer_order: footerOrder,
      locale: page.locale,
    },
  })

export const moveFooterPage = async (
  pages: TenantPage[],
  key: string,
  direction: "up" | "down"
): Promise<void> => {
  const writes = moveInFooter(pages, key, direction)
  await Promise.all(writes.map(({ page, footer_order }) => putPage(page, footer_order)))
  await queryClient.invalidateQueries({ queryKey: pagesQueryKeys.lists() })
}
