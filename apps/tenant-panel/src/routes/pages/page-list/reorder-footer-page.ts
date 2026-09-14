import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"
import { pagesQueryKeys, TenantPage } from "../../../hooks/api/pages"

// t05-page-keys: swaps `footer_order` between two footer-linked pages. Plain
// function rather than a hook — the swap always touches a row NEITHER of the
// two calling components mounted a `useUpdateTenantPage` for (the button
// lives on one row, the neighbour's mutation would have to be a second hook
// called conditionally) — so it goes straight through the same `sdk.client`
// every hook in `hooks/api/pages.tsx` uses, and invalidates the one list
// query the whole screen reads from once both writes land.

const putPage = (page: TenantPage, footerOrder: number | null) =>
  sdk.client.fetch(`/tenants/pages/${page.key}`, {
    method: "PUT",
    body: {
      title: page.title,
      body: page.body,
      published: page.published,
      in_footer: page.in_footer,
      footer_order: footerOrder,
    },
  })

export const swapFooterOrder = async (a: TenantPage, b: TenantPage): Promise<void> => {
  await Promise.all([putPage(a, b.footer_order ?? 0), putPage(b, a.footer_order ?? 0)])
  await queryClient.invalidateQueries({ queryKey: pagesQueryKeys.lists() })
}
