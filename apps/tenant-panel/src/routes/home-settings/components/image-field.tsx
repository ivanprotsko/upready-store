import { Spinner } from "@medusajs/icons"
import { Button, Text, toast } from "@medusajs/ui"
import { ReactNode, useState } from "react"
import { Control, FieldValues, Path } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { FileUpload, type FileType } from "../../../components/common/file-upload"
import { Form } from "../../../components/common/form"
import { uploadTenantFile } from "../use-home-edit"

// t-2026-10-14-01 (panel redesign, G4): the picture of the first screen and of
// a banner. The address field and the native file input of the old form are
// gone (design system, «Запрещено»): an empty slot is `FileUpload`'s
// «перетащите или нажмите» zone, a filled one is a file row with its picture.
// The file goes to `POST /tenants/uploads` the moment it is picked, so the
// platform's refusal comes at once; the drawer's «Сохранить» stores the address.

const IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]

/** The last part of the stored address: what the owner's file was called. */
const fileName = (url: string) => {
  const last = url.split("?")[0].split("/").pop() ?? ""
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

const FileRow = ({
  url,
  name,
  meta,
  busy = false,
  action,
}: {
  url: string
  name: string
  meta?: string
  busy?: boolean
  action?: ReactNode
}) => (
  <div className="flex items-center gap-x-3 rounded-md bg-ui-bg-component px-3 py-2 shadow-elevation-card-rest">
    <img src={url} alt="" className="h-12 w-[72px] shrink-0 rounded-md bg-ui-bg-subtle object-cover" />
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

type ImageSlotProps = {
  url: string | null
  /** The zone's second line: what the picture is for. */
  zoneHint: string
  /** The first screen's picture can be taken away; a banner's is only replaced. */
  removable: boolean
  /** Tells the drawer an upload is in flight, so «Сохранить» waits for it. */
  onUploadingChange: (uploading: boolean) => void
  onChange: (url: string | null) => void
}

const ImageSlot = ({ url, zoneHint, removable, onUploadingChange, onChange }: ImageSlotProps) => {
  const { t } = useTranslation()
  const [pending, setPending] = useState<FileType | null>(null)

  const handleUploaded = async (files: FileType[]) => {
    const picked = files[0]
    if (!picked) {
      return
    }
    setPending(picked)
    onUploadingChange(true)
    try {
      const uploaded = await uploadTenantFile(picked.file)
      if (uploaded?.url) {
        onChange(uploaded.url)
      }
    } catch (error) {
      // The platform owns every refusal; its own message is what the owner reads.
      toast.error(error instanceof Error ? error.message : t("homeSettings.image.uploadFailed"))
    } finally {
      URL.revokeObjectURL(picked.url)
      setPending(null)
      onUploadingChange(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-2" data-testid="home-image-slot">
      {pending ? (
        <FileRow url={pending.url} name={pending.file.name} meta={t("homeSettings.image.uploading")} busy />
      ) : url ? (
        <FileRow
          url={url}
          name={fileName(url)}
          action={
            removable ? (
              <Button type="button" size="small" variant="transparent" onClick={() => onChange(null)}>
                {t("homeSettings.image.remove")}
              </Button>
            ) : null
          }
        />
      ) : null}
      {pending || (url && removable) ? null : (
        <FileUpload
          label={url ? t("homeSettings.image.replace") : t("homeSettings.image.drop")}
          hint={zoneHint}
          multiple={false}
          formats={IMAGE_FORMATS}
          // The platform sets the size cap and says so in its refusal.
          maxFileSize={Infinity}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  )
}

/** A picture slot whose value is one address in the drawer's form. */
export const ImageField = <T extends FieldValues>({
  control,
  name,
  label,
  hint,
  optional,
  ...slot
}: Omit<ImageSlotProps, "url" | "onChange"> & {
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
        <ImageSlot {...slot} url={field.value || null} onChange={(url) => field.onChange(url)} />
        {hint ? <Form.Hint>{hint}</Form.Hint> : null}
        <Form.ErrorMessage />
      </Form.Item>
    )}
  />
)
