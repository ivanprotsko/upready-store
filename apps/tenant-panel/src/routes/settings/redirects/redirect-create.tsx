import { RedirectDrawer } from "./redirect-drawer"

// t-2026-10-14-01 (panel redesign, G2, prototype state `redirects-create`):
// «Добавить правило» opens this drawer on `/settings/redirects/create`, over
// the list.

export const RedirectCreate = () => <RedirectDrawer mode="create" />

export { RedirectCreate as Component }
