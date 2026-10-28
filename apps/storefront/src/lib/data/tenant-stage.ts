import "server-only"
import { isStageHeader, STAGE_HEADER } from "@lib/tenant/stage"
import { headers as nextHeaders } from "next/headers"

/**
 * Whether this request's shop is a stage site (t-2026-10-27-04), from the
 * header `src/middleware.ts` set. No request context reads as a live shop.
 */
export const isStageSite = async (): Promise<boolean> => {
  try {
    const headers = await nextHeaders()
    return isStageHeader(headers.get(STAGE_HEADER))
  } catch {
    return false
  }
}
