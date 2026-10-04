/**
 * One retry for a Store API call that failed at the proxy, not in Medusa
 * (t-2026-10-04-44).
 *
 * The storefront reaches the backend through the public ingress
 * (`https://${ENGINE_DOMAIN}`, deploy/compose.mt.yml), so a request can fail in
 * Traefik before Medusa ever sees it. Traefik answers 502 «Bad Gateway» when it
 * writes into a keep-alive connection the backend has just closed, and 503 while
 * no backend container is healthy. Medusa logs nothing for either. On
 * cherkashino.ru at 2026-10-04 02:15:27Z `initiatePaymentSession` threw
 * `Error: Bad Gateway`, the buyer saw «Что-то пошло не так» under Robokassa, the
 * backend logged no 5xx, and the next session 20 s later was created normally.
 *
 * The js-sdk throws a `FetchError` that carries the HTTP `status`. This module
 * reads that status, never the message text.
 */

export type UpstreamRetryOptions = {
  /**
   * True for a GET or another call that is safe to send twice. Such a call is
   * retried on 502, 503 and 504 and on a fetch that got no answer at all. A call
   * that is not idempotent is retried on 502 and 503 only. The proxy answers
   * those itself, while a 504 can mean Medusa is still working on the first call.
   */
  idempotent: boolean
  /** Pause before the retry, in ms. */
  delayMs?: number
}

const DEFAULT_DELAY_MS = 400

export const upstreamStatus = (error: unknown): number | null => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === "number" ? status : null
}

/** `fetch` itself rejected, so there was no response at all (refused or reset). */
const isNoResponse = (error: unknown): boolean =>
  error instanceof TypeError && /fetch failed/i.test(error.message)

export const isGatewayFailure = (
  error: unknown,
  { idempotent }: Pick<UpstreamRetryOptions, "idempotent">
): boolean => {
  const status = upstreamStatus(error)

  if (status === 502 || status === 503) {
    return true
  }

  return idempotent && (status === 504 || isNoResponse(error))
}

export const describeUpstreamFailure = (error: unknown): string => {
  const status = upstreamStatus(error)
  const message = String((error as { message?: unknown } | null)?.message ?? error)
  return status ? `${status} ${message}` : message
}

/**
 * Runs `call`. When it fails at the proxy (`isGatewayFailure`), this logs the
 * failure with the `[upstream-retry]` prefix and runs it once more. Any other
 * failure, and a second failure, reaches the caller unchanged.
 */
export async function retryOnGatewayFailure<T>(
  label: string,
  call: () => Promise<T>,
  options: UpstreamRetryOptions
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (!isGatewayFailure(error, options)) {
      throw error
    }

    const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
    console.warn(
      `[upstream-retry] ${label} failed with ${describeUpstreamFailure(error)}, retrying once in ${delayMs} ms`
    )
    await new Promise((resolve) => setTimeout(resolve, delayMs))

    return call()
  }
}
