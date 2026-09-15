import { useTranslation } from "react-i18next"

import type { WbStatusResponse } from "../../../../hooks/api/wb-status"

/**
 * Everything this platform is allowed to ask Wildberries for
 * (w01-wb-readonly-client).
 *
 * The list is the registry itself, served by `GET /tenants/wb/status`, so the
 * screen cannot fall out of step with the code. Each row links to the WB
 * documentation page the entry was read from, which is what makes the
 * "read-only" claim checkable rather than a promise.
 */
export const WbEndpointTable = ({
  endpoints,
}: {
  endpoints: WbStatusResponse["endpoints"]
}) => {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[640px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("wildberries.endpoints.method")}</th>
            <th className="py-2 pr-4 font-normal">{t("wildberries.endpoints.address")}</th>
            <th className="py-2 font-normal">{t("wildberries.endpoints.summary")}</th>
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
