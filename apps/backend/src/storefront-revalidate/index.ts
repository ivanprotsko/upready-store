/**
 * Tells the storefront process that a shop's data changed, so Next drops the
 * cached render (`apps/storefront/src/app/api/revalidate/route.ts`).
 *
 * Why its own address and not `STOREFRONT_URL`: on the multi-tenant stack
 * `STOREFRONT_URL` is the ENGINE's domain (`https://shipshift.dev`) because the
 * email subscribers build customer links from it, while the storefront is a
 * different container serving `<handle>.shipshift.dev`. Posting the webhook
 * there answered `status=404` (measured on the live stand 2026-09-14, backend
 * log line `[product-updated] Revalidation triggered … status=404`), so every
 * edit a shop owner made in the panel stayed invisible on their storefront.
 * `STOREFRONT_REVALIDATE_URL` names the storefront itself — on the stack that
 * is the internal `http://mt-storefront:8000`, which needs no public route and
 * no TLS. It falls back to `STOREFRONT_URL` so a single-shop stand, where the
 * two ARE the same address, keeps working untouched.
 *
 * Never throws: a cache that failed to clear must not fail the write that
 * caused it. The failure is loud in the log instead (rule 20a — a swallowed
 * failure has to surface somewhere).
 */
export type RevalidatePayload = {
  type: string;
  id?: string;
  handle?: string;
};

export const storefrontRevalidateBaseUrl = (): string | undefined =>
  process.env.STOREFRONT_REVALIDATE_URL || process.env.STOREFRONT_URL;

export const notifyStorefrontRevalidate = async (
  payload: RevalidatePayload,
): Promise<number | null> => {
  const baseUrl = storefrontRevalidateBaseUrl();

  if (!baseUrl) {
    console.warn(
      `[revalidate] neither STOREFRONT_REVALIDATE_URL nor STOREFRONT_URL is set, skipping type=${payload.type}`,
    );
    return null;
  }

  const secret = process.env.REVALIDATE_SECRET;

  try {
    const res = await fetch(`${baseUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret && { "x-revalidate-secret": secret }),
      },
      body: JSON.stringify(payload),
    });

    // A 2xx is the only outcome that cleared anything: 404 (wrong host), 401
    // (secret mismatch) and 5xx all leave the shop showing stale data, and each
    // of them used to read exactly like success in the old log line.
    const level = res.ok ? console.info : console.error;
    level(
      `[revalidate] type=${payload.type} handle=${payload.handle ?? "-"} id=${payload.id ?? "-"} url=${baseUrl}/api/revalidate status=${res.status}${res.ok ? "" : " NOT REVALIDATED"}`,
    );
    return res.status;
  } catch (err) {
    console.error(
      `[revalidate] type=${payload.type} url=${baseUrl}/api/revalidate failed:`,
      err,
    );
    return null;
  }
};
