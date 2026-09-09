import type React from "react"
import { getTranslations } from "next-intl/server"

import AddAddress from "../address-card/add-address"
import EditAddress from "../address-card/edit-address-modal"
import type { HttpTypes } from "@medusajs/types"

type AddressBookProps = {
  customer: HttpTypes.StoreCustomer
  region: HttpTypes.StoreRegion
}

/**
 * The dashed "New address" tile used to be the whole empty state (D3 §5c) —
 * a bare tile with no text reads the same on a first visit as "there might
 * be more below." One sentence under the tile tells the two apart (mockup's
 * fork resolution, "a bare dashed square with no text does not read as
 * empty").
 */
const AddressBook = async ({ customer, region }: AddressBookProps) => {
  const { addresses } = customer
  const t = await getTranslations("AddressCard")

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 mt-4">
        <AddAddress region={region} />
        {addresses.map((address) => {
          return (
            <EditAddress region={region} address={address} key={address.id} />
          )
        })}
      </div>
      {addresses.length === 0 && (
        <p
          className="mt-4 txt-small text-ui-fg-subtle"
          data-testid="addresses-empty-state"
        >
          {t("emptyState")}
        </p>
      )}
    </div>
  )
}

export default AddressBook
