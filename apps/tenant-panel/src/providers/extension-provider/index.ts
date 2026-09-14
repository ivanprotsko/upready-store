import { ComponentType } from "react"
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
// Only the methods the copied screens call are implemented, each a constant
// empty array: `getFormFields` and `getFormConfigs` (plugin-contributed form
// fields, product-create) and `getDisplays` (plugin-contributed read-only
// display components the product-detail sections render under their own rows,
// added by wave-2 piece 1). With no plugins there is nothing to contribute,
// exactly as the real ExtensionApi returns once every DashboardPlugin's
// formModule and displayModule are empty. No
// <ExtensionProvider> needs to be mounted in providers/providers.tsx for this
// to work, since the hook does not read React context.
type PanelExtensionApi = {
  getFormFields: (
    model: string,
    zone: string,
    tab?: string
  ) => FormField[]
  getFormConfigs: (model: string, zone: string) => ConfigField[]
  getDisplays: (
    model: string,
    zone: string
  ) => ComponentType<{ data: any }>[]
}

const noopExtensionApi: PanelExtensionApi = {
  getFormFields: () => [],
  getFormConfigs: () => [],
  getDisplays: () => [],
}

export const useExtension = (): PanelExtensionApi => noopExtensionApi
