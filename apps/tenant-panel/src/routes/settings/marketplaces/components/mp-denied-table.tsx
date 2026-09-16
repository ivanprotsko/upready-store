import { useTranslation } from "react-i18next"

import type { MarketplaceCard } from "../../../../hooks/api/marketplaces"

/**
 * What the marketplace's own documentation calls a WRITE
 * (w12-marketplace-core, spec 2.5, belt 4).
 *
 * It is on the screen so the owner can see what this platform is CHECKED
 * against, instead of being asked to trust the words «только чтение». Every
 * row is a method a registry entry may not name: an entry whose (verb, path)
 * stands here fails the backend at boot.
 *
 * The list is long on purpose — that is the size of the surface being refused.
 */
export const MpDeniedTable = ({ denied }: { denied: MarketplaceCard["denied"] }) => {
  const { t } = useTranslation()

  return (
    <details className="txt-compact-small">
      <summary className="text-ui-fg-interactive cursor-pointer py-2">
        {t("marketplaces.denied.toggle", { count: denied.length })}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="text-ui-fg-subtle">
            <tr className="border-ui-border-base border-b">
              <th className="py-2 pr-4 font-normal">{t("marketplaces.endpoints.method")}</th>
              <th className="py-2 pr-4 font-normal">{t("marketplaces.endpoints.address")}</th>
              <th className="py-2 font-normal">{t("marketplaces.endpoints.summary")}</th>
            </tr>
          </thead>
          <tbody>
            {denied.map((entry) => (
              <tr
                key={`${entry.method} ${entry.path}`}
                className="border-ui-border-base border-b last:border-b-0"
              >
                <td className="py-2 pr-4">{entry.method === "*" ? t("marketplaces.denied.anyVerb") : entry.method}</td>
                <td className="py-2 pr-4 font-mono">{entry.path}</td>
                <td className="py-2">
                  <a
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                    href={entry.doc_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {entry.summary}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
