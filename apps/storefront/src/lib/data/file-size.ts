import "server-only"

/**
 * The size of a file a lesson links to, for «Скачать «Рецепты» — PDF, 1,2 МБ»
 * (ask-20261005-054319-4ad4). Asked only of the shop's own API, the host of
 * `NEXT_PUBLIC_MEDUSA_BACKEND_URL` or `MEDUSA_BACKEND_URL` (on the RU instance
 * that is `api.cherkashino.ru`, where the course files live): the address
 * comes from text the tenant typed, and the storefront server must not be made
 * to call any host a lesson names.
 */

/** A HEAD answer is kept a day; a file under the same address rarely changes. */
const SIZE_REVALIDATE_SECONDS = 60 * 60 * 24
/** A slow file host must not hold the lesson page up. */
const SIZE_TIMEOUT_MS = 3000

const apiHosts = (): string[] =>
  [process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL, process.env.MEDUSA_BACKEND_URL].flatMap(
    (value) => {
      try {
        return value ? [new URL(value).host] : []
      } catch {
        return []
      }
    }
  )

/** Whether an address is a file of the shop's own API (and so may carry `download`). */
export const isApiFileUrl = (href: string): boolean => {
  try {
    const url = new URL(href)
    return /^https?:$/.test(url.protocol) && apiHosts().includes(url.host)
  } catch {
    return false
  }
}

/** Bytes from `Content-Length`, `null` for another host, an error or no length. */
export async function getFileSize(href: string): Promise<number | null> {
  if (!isApiFileUrl(href)) {
    return null
  }
  try {
    const response = await fetch(href, {
      method: "HEAD",
      next: { revalidate: SIZE_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(SIZE_TIMEOUT_MS),
    })
    if (!response.ok) {
      return null
    }
    const length = Number(response.headers.get("content-length"))
    return Number.isFinite(length) && length > 0 ? length : null
  } catch {
    return null
  }
}
