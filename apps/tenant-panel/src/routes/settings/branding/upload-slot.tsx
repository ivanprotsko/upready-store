import { Spinner } from "@medusajs/icons"
import { Button, Text, toast } from "@medusajs/ui"
import { ReactNode, useState } from "react"
import { Control, FieldValues, Path } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../components/common/form"
import { FileUpload, type FileType } from "../../../components/common/file-upload"
import {
  uploadBrandingFile,
  type TenantAppIcons,
  type UploadBrandingKind,
} from "../../../hooks/api/branding"
import { BrandingThumb, type BrandingThumbShape, fileFormat, useFileSize } from "./branding-file"

/** One branding upload slot in a drawer (t16-owner-branding), reused for the
 * light logo, the dark logo, the favicon and the og image, and for the two
 * optional app-icon masters (t-2026-10-03-61). An icon kind also hands up the
 * `app_icons` fields its upload built.
 *
 * t-2026-10-14-01 (panel redesign, G1 part 4): the native file input is gone
 * (design system, «Запрещено»). The slot follows Medusa's `FileUpload` idiom:
 * an empty slot is the «перетащите или нажмите» zone, a filled one is a file
 * row with its picture and «Убрать». The file still goes to
 * `POST /tenants/branding/upload` the moment it is picked, so the platform's
 * refusal (size, format, pixels) comes at once; the drawer's «Сохранить» then
 * stores the address. */

const IMAGE_FORMATS = ["image/svg+xml", "image/png", "image/webp"]

const FileRow = ({
  thumb,
  name,
  meta,
  busy = false,
  action,
}: {
  thumb: ReactNode
  name: string
  meta?: string
  busy?: boolean
  action?: ReactNode
}) => (
  <div className="flex items-center gap-x-3 rounded-md bg-ui-bg-component px-3 py-2 shadow-elevation-card-rest">
    {thumb}
    <div className="flex min-w-0 flex-1 flex-col">
      <Text size="small" leading="compact" weight="plus" className="truncate">
        {name}
      </Text>
      {meta ? (
        <Text size="xsmall" leading="compact" className={busy ? "text-ui-fg-interactive" : "text-ui-fg-subtle"}>
          {meta}
        </Text>
      ) : null}
    </div>
    {busy ? <Spinner className="shrink-0 animate-spin text-ui-fg-subtle" /> : action}
  </div>
)

export type UploadSlotProps = {
  kind: UploadBrandingKind
  url: string | null
  /** The zone's second line: the formats, and what an empty slot means. */
  zoneHint: string
  formats?: string[]
  shape?: BrandingThumbShape
  dark?: boolean
  /** A logo or a picture can be taken away; an icon master is only replaced. */
  removable?: boolean
  /** Tells the drawer an upload is in flight, so «Сохранить» waits for it. */
  onUploadingChange: (uploading: boolean) => void
  onChange: (url: string | null, appIcons?: Partial<TenantAppIcons>) => void
}

export const UploadSlot = ({
  kind,
  url,
  zoneHint,
  formats = IMAGE_FORMATS,
  shape = "logo",
  dark = false,
  removable = true,
  onUploadingChange,
  onChange,
}: UploadSlotProps) => {
  const { t } = useTranslation()
  const fileSize = useFileSize()
  const [pending, setPending] = useState<FileType | null>(null)
  // The name the owner's file had, for the address it was stored under.
  const [named, setNamed] = useState<{ url: string; name: string; size: number } | null>(null)

  const handleUploaded = async (files: FileType[]) => {
    const picked = files[0]
    if (!picked) {
      return
    }
    setPending(picked)
    onUploadingChange(true)
    try {
      const uploaded = await uploadBrandingFile(picked.file, kind)
      setNamed({ url: uploaded.file.url, name: picked.file.name, size: picked.file.size })
      onChange(uploaded.file.url, uploaded.app_icons)
    } catch (error) {
      // The platform owns every refusal; its own message is what the owner reads.
      toast.error(error instanceof Error ? error.message : t("general.error"))
    } finally {
      URL.revokeObjectURL(picked.url)
      setPending(null)
      onUploadingChange(false)
    }
  }

  const justUploaded = named && named.url === url ? named : null
  const format = fileFormat(url)

  return (
    <div className="flex flex-col gap-y-2" data-testid={`branding-upload-${kind}`}>
      {pending ? (
        <FileRow
          thumb={<BrandingThumb url={pending.url} shape={shape} dark={dark} />}
          name={pending.file.name}
          meta={t("brandingSettings.file.uploading")}
          busy
        />
      ) : url ? (
        <FileRow
          thumb={<BrandingThumb url={url} shape={shape} dark={dark} />}
          name={justUploaded ? justUploaded.name : t("brandingSettings.file.current")}
          meta={
            justUploaded
              ? [format, fileSize(justUploaded.size)].filter(Boolean).join(" · ")
              : (format ?? undefined)
          }
          action={
            removable ? (
              <Button type="button" size="small" variant="transparent" onClick={() => onChange(null)}>
                {t("brandingSettings.remove")}
              </Button>
            ) : null
          }
        />
      ) : null}
      {pending || (url && removable) ? null : (
        <FileUpload
          label={url ? t("brandingSettings.file.replace") : t("brandingSettings.file.drop")}
          hint={zoneHint}
          multiple={false}
          formats={formats}
          // The platform sets the cap per kind (2 MB logo, 512 KB icon, 5 MB picture) and says so.
          maxFileSize={Infinity}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  )
}

/** An upload slot whose value is one address in the drawer's form. */
export const UploadField = <T extends FieldValues>({
  control,
  name,
  label,
  hint,
  optional,
  ...slot
}: Omit<UploadSlotProps, "url" | "onChange"> & {
  control: Control<T>
  name: Path<T>
  label: string
  hint?: string
  optional?: boolean
}) => (
  <Form.Field
    control={control}
    name={name}
    render={({ field }) => (
      <Form.Item>
        <Form.Label optional={optional}>{label}</Form.Label>
        <UploadSlot {...slot} url={field.value ?? null} onChange={(url) => field.onChange(url)} />
        {hint ? <Form.Hint>{hint}</Form.Hint> : null}
        <Form.ErrorMessage />
      </Form.Item>
    )}
  />
)
