import { UIMatch } from "react-router-dom"

import { useSites } from "../../../../hooks/api/sites"

// The crumb after «Сайты» is the site's own name, read from the same list the
// card reads (`GET /tenants/sites`), so it costs no request of its own.
export const SiteDetailBreadcrumb = (props: UIMatch) => {
  const { id } = props.params || {}
  const { sites } = useSites()
  const site = sites?.find((candidate) => candidate.id === id)

  if (!site) {
    return null
  }

  return <span>{site.name}</span>
}
