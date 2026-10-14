import type { AdminFile } from "@medusajs/types"
import { useRef } from "react"
import { useTranslation } from "react-i18next"

import { useTenantHome, useUpdateTenantHome } from "../../hooks/api/home"
import { sdk } from "../../lib/client"
import { DEFAULT_DOCUMENT, type TenantHomeDocument } from "./composition"

// t-2026-10-14-01 (panel redesign, G4): one document, six sections, one hook.
// `PUT /tenants/home` replaces the document whole, so every drawer starts from
// the saved copy and sends it back with only its own part changed — what the
// single form on this page used to send, one section at a time. A tenant that
// never saved reads the storefront's defaults (`DEFAULT_DOCUMENT`).

export const useHomeDocument = () => {
  const { home, isPending, isError, error } = useTenantHome()
  const { mutateAsync } = useUpdateTenantHome()

  if (isError) {
    throw error
  }

  const doc: TenantHomeDocument = home ?? DEFAULT_DOCUMENT

  /** Sends the whole document; `edit` changes only the drawer's own part. */
  const save = (edit: (doc: TenantHomeDocument) => TenantHomeDocument) => {
    const next = edit(doc)
    return mutateAsync({ theme: next.theme, settings: next.settings, content: next.content })
  }

  return { doc, saved: home ?? null, isPending, save }
}

/**
 * The multipart upload the panel already uses for product media, pointed at
 * `POST /tenants/uploads` (there is no `sdk.admin`-shaped wrapper for the tenant
 * namespace — the js-sdk hardcodes `/admin/...`).
 */
export const uploadTenantFile = async (file: File): Promise<AdminFile | undefined> => {
  const form = new FormData()
  form.append("files", file)

  const { files } = await sdk.client.fetch<{ files: AdminFile[] }>("/tenants/uploads", {
    method: "POST",
    headers: { "Content-Type": null },
    body: form,
  })

  return files?.[0]
}

/** Counts the uploads in flight. «Сохранить» before one lands is refused with a toast and the
 * drawer stays open, or the picture would land after the drawer closed and be lost (the same
 * rule as «Оформление», decide d-2026-10-14-188). */
export const useUploadGate = () => {
  const { t } = useTranslation()
  const inFlight = useRef(0)

  return {
    track: (uploading: boolean) => {
      inFlight.current = Math.max(0, inFlight.current + (uploading ? 1 : -1))
    },
    guard:
      <TValues>(save: (values: TValues) => Promise<unknown>) =>
      (values: TValues) => {
        if (inFlight.current > 0) {
          return Promise.reject(new Error(t("homeSettings.image.stillUploading")))
        }
        return save(values)
      },
  }
}
