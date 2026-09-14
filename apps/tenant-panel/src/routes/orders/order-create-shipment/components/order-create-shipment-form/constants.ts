import { z } from "zod"

export const CreateShipmentSchema = z.object({
  labels: z.array(
    z.object({
      tracking_number: z.string(),
      // TODO: this 2 are not optional in the API
      tracking_url: z.string().optional(),
      label_url: z.string().optional(),
    })
  ),
  send_notification: z.boolean().optional(),
  // tenant-panel (t04-shipping-tariffs): the carrier the owner hands the parcel
  // to, free text («СДЭК», «Почта России»); stored as fulfillment.metadata.carrier.
  carrier: z.string().max(80).optional(),
})
