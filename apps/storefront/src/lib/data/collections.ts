"use server"

import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { getCacheOptions, getTenantHandle } from "./cookies"
import { siteWideRead } from "./site-wide"

export const retrieveCollection = async (id: string) => {
  const next = {
    ...(await getCacheOptions("collections")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  return await sdk.client
    .fetch<{ collection: HttpTypes.StoreCollection }>(
      `/store/collections/${id}`,
      {
        next,
        cache: "force-cache",
      }
    )
    .then(({ collection }) => collection)
}

export const listCollections = async (
  queryParams: Record<string, string> = {}
): Promise<{ collections: HttpTypes.StoreCollection[]; count: number }> => {
  const next = {
    ...(await getCacheOptions("collections")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  queryParams.limit = queryParams.limit || "100"
  queryParams.offset = queryParams.offset || "0"

  // Site-wide: the footer's link lists render on every route under `(main)`,
  // so this read follows the rule in `lib/data/site-wide.ts` and degrades to an
  // empty list instead of throwing the whole page away.
  return siteWideRead(
    "listCollections /store/collections",
    () =>
      sdk.client
        .fetch<{ collections: HttpTypes.StoreCollection[]; count: number }>(
          "/store/collections",
          {
            query: queryParams,
            next,
            cache: "force-cache",
          }
        )
        .then(({ collections }) => ownedByThisShop(collections))
        .then((collections) => ({ collections, count: collections.length })),
    { collections: [], count: 0 }
  )
}

/**
 * Collections are global rows: `/store/collections` lists every one in the database
 * whichever publishable key asks. Products are not — the key selects the sales
 * channel — so on the shared engine a shop owns a collection only through the products
 * it can see in it. Without this, a wizard-created shop with an empty catalog listed
 * the sneakers profile's four collections in its footer, every link leading to an
 * empty page (measured on nochlavka.shipshift.dev, 2026-09-12). One `limit=1` product
 * probe per collection, cached under this shop's `products` tag like every other
 * product read. A single-store deployment resolves no tenant and keeps the whole list.
 *
 * A probe that fails drops its collection and says so on stderr: hiding a collection
 * the shop owns is the visible failure, listing a neighbour's is the silent one.
 */
const ownedByThisShop = async (
  collections: HttpTypes.StoreCollection[]
): Promise<HttpTypes.StoreCollection[]> => {
  if (!collections.length || (await getTenantHandle()) === null) {
    return collections
  }

  const owned = await Promise.all(
    collections.map((collection) => sellsInCollection(collection.id, collection.handle ?? ""))
  )

  return collections.filter((_, index) => owned[index])
}

/**
 * One collection's probe, made once per collection in a render. Every footer variant, hero M and
 * the lead collection ask `listCollections()` on the same page, 13 times on the template lab, and
 * each call probed every collection again: 351 reads for 27 collections there
 * (stand-render-time, t-2026-10-12-33). The fetch itself was already one request; React's
 * `cache` saves its parse and its redaction for every repeat, and the answer stays the same.
 */
const sellsInCollection = cache(async (collectionId: string, handle: string): Promise<boolean> => {
  const next = {
    ...(await getCacheOptions("products")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  return sdk.client
    .fetch<{ products: { id: string }[] }>("/store/products", {
      query: { collection_id: collectionId, limit: 1, fields: "id" },
      next,
      cache: "force-cache",
    })
    .then(({ products }) => products.length > 0)
    .catch((error) => {
      console.error(
        `listCollections: could not probe collection "${handle}" for this shop; leaving it out`,
        error
      )
      return false
    })
})

export const getCollectionByHandle = async (
  handle: string
): Promise<HttpTypes.StoreCollection | null> => {
  const next = {
    ...(await getCacheOptions("collections")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  return await sdk.client
    // No `*products` here: a collection is one row for every shop, so its products
    // are every shop's, drafts included, and the backend drops the field
    // (`apps/backend/src/api/field-guard.ts`). The page lists the products through
    // `/store/products`, which the sales channel scopes.
    .fetch<HttpTypes.StoreCollectionListResponse>(`/store/collections`, {
      query: { handle },
      next,
      cache: "force-cache",
    })
    .then(({ collections }) => collections[0] || null)
}
