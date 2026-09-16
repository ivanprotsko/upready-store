import { Navigate } from "react-router-dom"

/**
 * `/settings/wildberries` -> `/settings/marketplaces` (w12-marketplace-core).
 *
 * The Wildberries page became the Wildberries CARD of the «Маркетплейсы»
 * section. The old path stays and redirects rather than 404-ing, because the
 * owner has it bookmarked and the home screen linked to it for a wave.
 *
 * `replace` so the browser Back button leaves the section instead of bouncing
 * through the old path again.
 *
 * The page's own components live on: `wb-write-section.tsx` is rendered by the
 * Wildberries card (w20's owner consent screen is still Wildberries' alone),
 * and the rest became the shared `mp-*` components.
 */
export const WildberriesRedirect = () => <Navigate replace to="/settings/marketplaces" />
