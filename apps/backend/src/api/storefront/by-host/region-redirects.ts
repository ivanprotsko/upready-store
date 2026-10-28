/**
 * The countries whose buyers belong to ANOTHER shop (t-2026-10-20-22). Ivan,
 * 20.10.2026: «нужно сделать попап с выбором региона и если человек выбирает
 * "россия", то пусть выполняется переадресация на сайт cherkashino.ru».
 *
 * Kept in `tenant.metadata.region_redirects` as `{ "<iso_2>": "<url>" }`, for
 * cherkashino-com `{ "ru": "https://cherkashino.ru" }`
 * (`src/scripts/set-tenant-region-redirect.ts` writes it). A shop without the
 * key answers an empty list, and the storefront then shows no region popup.
 * Only a two-letter country and an http(s) address pass, reduced to its
 * origin: the visitor is sent to the other shop's home, never to a path this
 * shop cannot know exists there.
 */
export type RegionRedirect = { country: string; url: string };

export const readRegionRedirects = (
  metadata: Record<string, unknown> | null | undefined,
): RegionRedirect[] => {
  const block = metadata?.region_redirects;
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return [];
  }

  const redirects: RegionRedirect[] = [];
  for (const [rawCountry, rawUrl] of Object.entries(block as Record<string, unknown>)) {
    const country = rawCountry.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(country) || typeof rawUrl !== "string") {
      continue;
    }
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      continue;
    }
    redirects.push({ country, url: `${url.origin}/` });
  }

  return redirects;
};
