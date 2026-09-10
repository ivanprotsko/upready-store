// tenant-panel: stub for the Admin's common/required-permissions-section,
// excluded from the bulk copy along with `permissions-provider` (no RBAC in
// the tenant API). The Admin's version reads a route's declared required
// permissions off `providers/permissions-provider` and lists the ones the
// current user lacks, in the JSON/metadata debug section of a detail page.
// `components/layout/pages/two-column-page.tsx` renders this element by
// default (`requiredPermissionsSection = <RequiredPermissionsSection />`)
// only when `showJSON` is true, which no screen in this piece sets, so this
// renders nothing rather than reimplementing the permissions read.
export const RequiredPermissionsSection = () => null
