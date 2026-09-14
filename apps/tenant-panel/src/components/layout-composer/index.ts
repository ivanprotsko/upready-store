// tenant-panel: trimmed barrel. The Admin's index.ts also re-exports
// `customizer-menu` and `constants`, part of the widget/layout-editing system
// this panel does not have. `detail-page-defaults` is a verbatim copy added by
// wave-2 piece 1: it is the metadata/JSON/permissions trio every copied detail
// screen ends with, and it depends on nothing the panel dropped.
export * from "./layout-composer"
export * from "./types"
export * from "./entry"
export { detailPageDefaultEntries } from "./detail-page-defaults"
