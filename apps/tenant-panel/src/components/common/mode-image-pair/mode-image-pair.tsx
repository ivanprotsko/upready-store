import { Input, Label, Text, clx } from "@medusajs/ui"
import type { ReactNode } from "react"

/**
 * The one block that adds a second image version for dark mode
 * (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). Three screens use it — the home page's
 * hero, a product category, a product — and they use THIS component rather than three
 * similar layouts, so the owner learns it once: two equal slots, the same captions, the
 * same empty state (rule 20, and the design stage's own requirement that the layout be
 * the same and not merely alike).
 *
 * Design stage: `artifacts/docs/2026-09-12-mode-image-pairs-mockup.md`, frames S1-S3.
 *
 * The "no pair" state is written on the screen, not left to be inferred: an empty dark
 * slot says what the storefront will do (show the light image), because that is the normal
 * state and not a defect — the pair is optional on all three surfaces.
 *
 * A slot with no `onChange` is not editable HERE and says where it is edited instead: on
 * the product screen the light version is whatever the Medusa media gallery has as the
 * main image, and a second address field for the same picture would be a second way to say
 * one thing.
 */
export type ModeImagePairSlot = {
  /** The address as stored; an empty string is the empty state. */
  value: string
  /** Absent makes the slot read-only; `lockedLabel` then says where it is edited. */
  onChange?: (next: string) => void
  onUpload?: (file: File | undefined) => void
  uploading?: boolean
  lockedLabel?: string
  /** An extra control for a read-only slot, e.g. a link to the gallery that owns it. */
  lockedAction?: ReactNode
  /** Shown under an EMPTY slot: what the storefront does while nothing is here. */
  emptyHint?: string
  testId: string
}

const SWATCH = {
  light: "bg-ui-bg-base border-ui-border-strong",
  dark: "bg-ui-bg-overlay border-ui-border-strong",
} as const

function Slot({
  title,
  tone,
  aspect,
  slot,
  uploadLabel,
  uploadingLabel,
  removeLabel,
  emptyLabel,
  placeholder,
}: {
  title: string
  tone: keyof typeof SWATCH
  aspect: string
  slot: ModeImagePairSlot
  uploadLabel: string
  uploadingLabel: string
  removeLabel: string
  emptyLabel: string
  placeholder: string
}) {
  const { value, onChange, onUpload, uploading, lockedLabel, lockedAction, emptyHint } = slot

  return (
    <div className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base p-3">
      <div className="flex items-center gap-x-2">
        <span className={clx("size-2.5 rounded-sm border", SWATCH[tone])} />
        <Text size="small" weight="plus" className="text-ui-fg-base">
          {title}
        </Text>
      </div>

      <div
        className={clx(
          "w-full overflow-hidden rounded-md",
          aspect,
          value
            ? "bg-ui-bg-subtle"
            : "grid place-items-center border border-dashed border-ui-border-strong bg-ui-bg-subtle"
        )}
      >
        {value ? (
          // A plain <img>: the address may point at any host the shop uploaded to, and the
          // panel has no image optimizer of its own.
          <img
            src={value}
            alt=""
            className="size-full object-cover"
            data-testid={`${slot.testId}-preview`}
          />
        ) : (
          <Text size="small" className="px-2 text-center text-ui-fg-muted">
            {emptyLabel}
          </Text>
        )}
      </div>

      {onChange ? (
        <div className="flex items-center gap-x-2">
          <Input
            id={slot.testId}
            data-testid={slot.testId}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {onUpload ? (
            <label className="shrink-0">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                data-testid={`${slot.testId}-upload`}
                onChange={(event) => onUpload(event.target.files?.[0])}
              />
              <span className="txt-compact-small-plus inline-flex h-8 cursor-pointer items-center rounded-md border border-ui-border-base px-3 text-ui-fg-subtle hover:bg-ui-bg-base-hover">
                {uploading ? uploadingLabel : uploadLabel}
              </span>
            </label>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-x-2">
          <div className="txt-compact-small flex h-8 flex-1 items-center overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-disabled px-2 text-ui-fg-muted">
            <span className="truncate">{lockedLabel}</span>
          </div>
          {lockedAction}
        </div>
      )}

      {onChange && value ? (
        <button
          type="button"
          className="txt-small self-start text-ui-fg-subtle underline"
          data-testid={`${slot.testId}-clear`}
          onClick={() => onChange("")}
        >
          {removeLabel}
        </button>
      ) : null}

      {!value && emptyHint ? (
        <Text size="small" className="text-ui-tag-orange-text">
          {emptyHint}
        </Text>
      ) : null}
    </div>
  )
}

export const ModeImagePair = ({
  label,
  help,
  aspect = "aspect-[4/5]",
  light,
  dark,
  labels,
}: {
  label: string
  help?: string
  /** The frame's shape, matching how the storefront crops it: tiles and cards are 4:5, the
   *  hero is a wide band. A preview in the wrong shape teaches the wrong crop. */
  aspect?: string
  light: ModeImagePairSlot
  dark: ModeImagePairSlot
  /** Every visible string, so the screen owns its copy and this block owns no i18n keys. */
  labels: {
    light: string
    dark: string
    upload: string
    uploading: string
    remove: string
    empty: string
    placeholder: string
  }
}) => {
  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {label}
      </Label>
      {help ? (
        <Text size="small" className="text-ui-fg-subtle">
          {help}
        </Text>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Slot
          title={labels.light}
          tone="light"
          aspect={aspect}
          slot={light}
          uploadLabel={labels.upload}
          uploadingLabel={labels.uploading}
          removeLabel={labels.remove}
          emptyLabel={labels.empty}
          placeholder={labels.placeholder}
        />
        <Slot
          title={labels.dark}
          tone="dark"
          aspect={aspect}
          slot={dark}
          uploadLabel={labels.upload}
          uploadingLabel={labels.uploading}
          removeLabel={labels.remove}
          emptyLabel={labels.empty}
          placeholder={labels.placeholder}
        />
      </div>
    </div>
  )
}

/**
 * The captions, in one place. The block deliberately takes its strings as a prop rather
 * than calling `useTranslation` itself, and this is what keeps the three screens from
 * drifting apart anyway: they all pass `modeImagePairLabels(t)`. A screen that needs a
 * different word passes its own object and says why.
 *
 * `t` is typed structurally so this file does not depend on which i18n library the panel
 * uses today.
 */
export const modeImagePairLabels = (
  t: (key: string, options: { defaultValue: string }) => string
) => ({
  light: t("modeImagePair.light", { defaultValue: "Light theme" }),
  dark: t("modeImagePair.dark", { defaultValue: "Dark theme" }),
  upload: t("modeImagePair.upload", { defaultValue: "Upload" }),
  uploading: t("modeImagePair.uploading", { defaultValue: "Uploading…" }),
  remove: t("modeImagePair.remove", { defaultValue: "Remove" }),
  empty: t("modeImagePair.empty", { defaultValue: "No image" }),
  placeholder: t("modeImagePair.placeholder", { defaultValue: "Image address" }),
})
