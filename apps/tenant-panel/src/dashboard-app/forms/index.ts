// tenant-panel: own file. The Admin's dashboard-app/forms/index.ts is
// identical (`export * from "./form-extension-zone"; export * from
// "./hooks"`); kept as its own file only because the barrel it would
// otherwise sit in (dashboard-app/index.ts) is not copied, see there.
export * from "./form-extension-zone"
export * from "./hooks"
