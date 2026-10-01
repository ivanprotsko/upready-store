/**
 * Same-origin return-path sanitising, shared by the Yandex ID flow
 * (`lib/util/yandex-auth.ts`) and the password login/sign-up redirect from
 * cart and checkout (`lib/data/customer.ts`).
 *
 * Only a local path of this shop survives: a protocol-relative path
 * (`//host`), an absolute URL with any scheme (it never starts with "/"), a
 * backslash-disguised host (`/\host`, which some URL parsers normalise to
 * `//host`) and anything that does not start with "/" are all rejected.
 */
export function isLocalReturnPath(
  raw: string | null | undefined
): raw is string {
  if (!raw || !raw.startsWith("/")) {
    return false
  }
  return !raw.replace(/\\/g, "/").startsWith("//")
}

/** Strips a stale `yandex_error` marker so a second failure does not stack two. */
function cleanReturnPath(raw: string): string {
  const [path, query = ""] = raw.split("?")
  const params = new URLSearchParams(query)
  params.delete("yandex_error")
  const rest = params.toString()
  return rest ? `${path}?${rest}` : path
}

/** Validates `raw`, or `/` when it fails — the Yandex flow's own fallback. */
export function sanitizeReturnPath(raw: string | null | undefined): string {
  return isLocalReturnPath(raw) ? cleanReturnPath(raw) : "/"
}

/** Validates `raw`, or the account page of `locale` when it fails. */
export function sanitizeAccountReturnPath(
  raw: string | null | undefined,
  locale: string
): string {
  return isLocalReturnPath(raw) ? cleanReturnPath(raw) : `/${locale}/account`
}
