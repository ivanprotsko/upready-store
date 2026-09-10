import { ComponentType } from "react"
import { z } from "zod"

// tenant-panel: own file, trimmed to the two shapes `dashboard-app/forms`
// (copied verbatim from the Admin) actually needs. The Admin's real
// dashboard-app/types.ts also declares route/menu/widget/display/layout
// extension types for its plugin system; the panel has no plugin system (see
// providers/extension-provider), so those are dropped along with it.

export type FormFieldExtension = {
  validation: z.ZodTypeAny
  Component?: ComponentType<any>
  label?: string
  description?: string
  placeholder?: string
}

export type FormField = FormFieldExtension & {
  name: string
}

export type ConfigFieldExtension = {
  defaultValue: ((data: any) => any) | any
  validation: z.ZodTypeAny
}

export type ConfigField = ConfigFieldExtension & {
  name: string
}
