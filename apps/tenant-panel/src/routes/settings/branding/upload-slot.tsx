import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Label, Text, toast } from "@medusajs/ui"
import {
  uploadBrandingFile,
  type TenantAppIcons,
  type UploadBrandingKind,
} from "../../../hooks/api/branding"

/** One branding upload slot: preview thumbnail, file input, remove button.
 * Split out of `branding.tsx` (rule: one component per file) — reused for the
 * light logo, the dark logo, the favicon and the og image, and for the two
 * optional app-icon masters (t-2026-10-03-61). An icon kind also hands up the
 * `app_icons` fields its upload built. */
export const UploadSlot = ({
  label,
  hint,
  kind,
  url,
  busy,
  disabled = false,
  removable = true,
  accept = "image/svg+xml,image/png,image/webp",
  onChange,
}: {
  label: string
  hint?: string
  kind: UploadBrandingKind
  url: string | null
  busy: boolean
  disabled?: boolean
  removable?: boolean
  accept?: string
  onChange: (url: string | null, appIcons?: Partial<TenantAppIcons>) => void
}) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadBrandingFile(file, kind)
      onChange(uploaded.file.url, uploaded.app_icons)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {label}
      </Label>
      {hint ? (
        <Text size="small" className="text-ui-fg-subtle">
          {hint}
        </Text>
      ) : null}
      <div className="flex items-center gap-x-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle">
          {url ? (
            <img src={url} alt={label} className="max-h-14 max-w-14 object-contain" />
          ) : (
            <Text size="small" className="text-ui-fg-muted">
              —
            </Text>
          )}
        </div>
        <div className="flex flex-col gap-y-1">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={busy || uploading || disabled}
            onChange={(event) => handleFile(event.target.files?.[0])}
            className="txt-compact-small"
          />
          {url && removable ? (
            <button
              type="button"
              className="txt-compact-small text-ui-fg-muted hover:text-ui-fg-base underline text-left"
              onClick={() => onChange(null)}
              disabled={busy || uploading || disabled}
            >
              {t("brandingSettings.remove", { defaultValue: "Убрать" })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
