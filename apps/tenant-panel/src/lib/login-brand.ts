/**
 * Whose mark the sign-in screens show (t-2026-10-13-23): the login, «forgot password» and «new
 * password» pages come before any shop is known, so the brand is the one of the host the panel is
 * opened on. The table is docs/owner-guide/brands.json, the same one nginx picks the help's build by
 * (apps/tenant-panel/nginx.conf): a listed host gets its row, any other host the `default` row. The
 * match is exact, like the nginx map.
 *
 * Plain data, no JSX and no import of the table: `components/common/brand-mark` passes it in, and
 * `__tests__/login-brand.test.mjs` imports and runs this against the real file.
 */
export type Brand = { name: string; logo: string }

export type BrandsTable = { default: Brand; hosts: Record<string, Brand> }

export const brandOfHost = (brands: BrandsTable, host: string): Brand => {
  const key = host.toLowerCase()
  // Own keys only: a host named like an Object.prototype member is not a row.
  return Object.prototype.hasOwnProperty.call(brands.hosts, key) ? brands.hosts[key] : brands.default
}
