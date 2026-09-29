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

// A-15 (46df audit): one attempt meant a single dropped packet or a storefront
// mid-deploy left the catalog cache stale until the next unrelated write, with
// no ceiling to fall back on before this task's own `revalidate: 3600` (the
// tag-based clear IS the fast path — this is only how often it gets to run).
// Two retries (three attempts total), a short pause between each — long enough
// to ride out a storefront container restart, short enough that the write
// this is called from does not hang the caller waiting on the network.
const RETRY_PAUSES_MS = [300, 1200];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const notifyStorefrontRevalidate = async (
  payload: RevalidatePayload,
  deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<number | null> => {
  const doFetch = deps.fetch ?? fetch;
  const doSleep = deps.sleep ?? sleep;

  const baseUrl = storefrontRevalidateBaseUrl();

  if (!baseUrl) {
    console.warn(
      `[revalidate] neither STOREFRONT_REVALIDATE_URL nor STOREFRONT_URL is set, skipping type=${payload.type}`,
    );
    return null;
  }

  const secret = process.env.REVALIDATE_SECRET;
  const attempts = RETRY_PAUSES_MS.length + 1;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const label = attempts > 1 ? ` attempt=${attempt}/${attempts}` : "";

    try {
      const res = await doFetch(`${baseUrl}/api/revalidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret && { "x-revalidate-secret": secret }),
        },
        body: JSON.stringify(payload),
      });

      lastStatus = res.status;

      // A 2xx is the only outcome that cleared anything: 404 (wrong host), 401
      // (secret mismatch) and 5xx all leave the shop showing stale data, and each
      // of them used to read exactly like success in the old log line.
      if (res.ok) {
        console.info(
          `[revalidate] type=${payload.type} handle=${payload.handle ?? "-"} id=${payload.id ?? "-"} url=${baseUrl}/api/revalidate status=${res.status}${label}`,
        );
        return res.status;
      }

      console.error(
        `[revalidate] type=${payload.type} handle=${payload.handle ?? "-"} id=${payload.id ?? "-"} url=${baseUrl}/api/revalidate status=${res.status} NOT REVALIDATED${label}`,
      );
    } catch (err) {
      console.error(
        `[revalidate] type=${payload.type} url=${baseUrl}/api/revalidate failed${label}:`,
        err,
      );
    }

    if (attempt < attempts) {
      await doSleep(RETRY_PAUSES_MS[attempt - 1]);
    }
  }

  return lastStatus;
};
