import { HttpTypes } from "@medusajs/types"
import { LoaderFunctionArgs } from "react-router-dom"

import { campaignsQueryKeys } from "../../../hooks/api/campaigns"
import { sdk } from "../../../lib/client"
import { queryClient } from "../../../lib/query-client"
import { CAMPAIGN_DETAIL_FIELDS } from "./constants"

const campaignDetailQuery = (id: string) => ({
  queryKey: campaignsQueryKeys.detail(id),
  // tenant-panel: `/tenants/campaigns/:id` instead of the admin module's
  // hardcoded `/admin/campaigns/:id`; the fields stay the screen's own.
  queryFn: async () =>
    sdk.client.fetch<HttpTypes.AdminCampaignResponse>(`/tenants/campaigns/${id}`, {
      query: { fields: CAMPAIGN_DETAIL_FIELDS },
    }),
})

export const campaignLoader = async ({ params }: LoaderFunctionArgs) => {
  const id = params.id
  const query = campaignDetailQuery(id!)

  return queryClient.ensureQueryData(query)
}
