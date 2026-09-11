// tenant-panel: trimmed barrel. The Admin's index.ts also re-exports
// `customizer-menu` and `constants`, part of the widget/layout-editing system
// this panel does not have.
//
// tenant-panel: wave 2, piece 2 put `detail-page-defaults` back. The copied
// order-detail screen calls `detailPageDefaultEntries(order)` for the metadata,
// JSON and required-permissions sections at the bottom of the page, and all
// three components it uses are already in the panel
// (`components/common/{metadata-section,json-view-section,required-permissions-section}`;
// the last one is the panel's stub that renders null). Without it the order
// page would lose the JSON section the Admin shows, which is one of the things
// the screenshot comparison checks.
export * from "./layout-composer"
export * from "./types"
export * from "./entry"
export * from "./detail-page-defaults"
