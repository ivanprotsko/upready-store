// Variant of the f16 class, face B, written with `>` instead of `>=`: the
// owner's own banners are read and then thrown away unless there are at least
// three of them, and what the visitor gets instead was baked into the image.
import { collectionBanners } from "@lib/profile"

export async function banners() {
  const collections = await listCollections({ fields: "id,handle,metadata" })
  const own = collections
    .filter((collection) => typeof collection.metadata?.banner_url === "string")
    .map((collection) => ({ href: collection.handle, image: collection.metadata.banner_url }))

  if (own.length > 2) {
    return own
  }

  return collectionBanners
}
