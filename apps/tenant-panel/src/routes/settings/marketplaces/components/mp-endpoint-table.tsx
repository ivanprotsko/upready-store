import { useTranslation } from "react-i18next"

import type { MarketplaceCard } from "../../../../hooks/api/marketplaces"

/**
 * Everything this platform is allowed to ask ONE marketplace for
 * (w12-marketplace-core, generalised from `wb-endpoint-table`).
 *
 * The list is the adapter's registry itself, served by the API, so the screen
 * cannot fall out of step with the code. Each row links to the documentation
 * page the entry was read from, which is what makes «только чтение» checkable
 * instead of a promise.
 */
export const MpEndpointTable = ({ endpoints }: { endpoints: MarketplaceCard["endpoints"] }) => {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[640px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("marketplaces.endpoints.method")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.endpoints.address")}</th>
            <th className="py-2 font-normal">{t("marketplaces.endpoints.summary")}</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((endpoint) => (
            <tr key={endpoint.id} className="border-ui-border-base border-b last:border-b-0">
              <td className="py-2 pr-4">{endpoint.method}</td>
              <td className="py-2 pr-4 font-mono">
                {endpoint.host}
                {endpoint.path}
              </td>
              <td className="py-2">
                <a
                  className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  href={endpoint.doc_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {endpoint.summary}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
