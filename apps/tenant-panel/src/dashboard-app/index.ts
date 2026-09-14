// tenant-panel: own file, replacing the Admin's dashboard-app/index.ts. The
// real one also re-exports the DashboardApp class (menu/widget/route/i18n
// extension plumbing for the plugin system) and dashboard-app/links,
// dashboard-app/routes/utils; none of that exists in the panel (no plugins,
// no extensions, see providers/feature-flag-provider and
// providers/extension-provider for the same "no extensions" invariant). Only
// `FormExtensionZone` and its types are re-exported, because
// routes/products/product-create's copied files import it from here.
export * from "./forms"
