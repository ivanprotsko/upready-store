import { Navigate } from "react-router-dom"

/**
 * `/settings/ozon` -> `/settings/marketplaces#ozon`
 * (w24-integration-keys-self-service).
 *
 * The task asked for an Ozon page with a `Client-Id` and an `Api-Key` field.
 * It is the Ozon CARD that holds them, for the reason w12 made the Wildberries
 * page a redirect: every marketplace screen is generated from the registry, so
 * a page written per marketplace is the copy that stops being updated (rule
 * 20) — and the Ozon card already shows the connection, the rights, the
 * imports and the mirrors that a page of its own would have to duplicate.
 *
 * The path exists anyway, and is linked from the sidebar, because «where do I
 * enter my Ozon key» must have an answer that is not «scroll the marketplaces
 * screen». The hash takes the owner to the card itself.
 */
export const OzonRedirect = () => <Navigate replace to="/settings/marketplaces#ozon" />
