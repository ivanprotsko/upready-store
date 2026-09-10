import { ConfigField, FormField } from "../../dashboard-app/types"

// tenant-panel: own file, replacing the Admin's providers/extension-provider
// (an ExtensionContext + <ExtensionProvider api={...}> that a real
// DashboardApp populates from installed plugins at boot). The panel has no
// plugin/extension system, same invariant as providers/feature-flag-provider
// (every flag false, nothing fetched) and matching piece 1's README, which
// noted extension-provider was "not copied at all (no consumer in this
// piece's scope)" — piece 3's copied product-create screens are now a
// consumer, so this stub exists to satisfy them.
//
// Only the two methods the copied product-create screens call
// (`getFormFields`, `getFormConfigs`, both for plugin-contributed form
// fields) are implemented, both as constant empty arrays: with no plugins
// there is nothing to contribute, exactly as the real ExtensionApi would
// return once every DashboardPlugin's formModule is empty. No
// <ExtensionProvider> needs to be mounted in providers/providers.tsx for this
// to work, since the hook does not read React context.
type PanelExtensionApi = {
  getFormFields: (
    model: string,
    zone: string,
    tab?: string
  ) => FormField[]
  getFormConfigs: (model: string, zone: string) => ConfigField[]
}

const noopExtensionApi: PanelExtensionApi = {
  getFormFields: () => [],
  getFormConfigs: () => [],
}

export const useExtension = (): PanelExtensionApi => noopExtensionApi
