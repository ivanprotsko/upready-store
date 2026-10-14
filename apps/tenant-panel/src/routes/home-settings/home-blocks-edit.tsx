import { Select } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../components/common/form"
import { SettingsEditDrawer } from "../../components/settings"
import {
  BLOCK_SLOTS,
  SLOT_VALUES,
  type StorefrontSettingsInput,
  blockedReason,
} from "./composition"
import { useHomeDocument } from "./use-home-edit"

// t-2026-10-14-01 (panel redesign, G4, prototype state `home-blocks-edit`):
// the five composition choices — header, first screen, category tiles, product
// list, footer — each with the one line that says how the chosen variant looks.
// An option a FORBIDDEN pair blocks right now is greyed and its reason is
// written under the field, the way the storefront's own composition popover
// greys it; zod refuses the pair too, and the platform re-checks it (422).
// Route `blocks/edit`.

type BlocksValues = Omit<StorefrontSettingsInput, "defaultMode">

export const HomeBlocksEdit = () => {
  const { t } = useTranslation()
  const { doc, isPending, save } = useHomeDocument()

  const option = (slot: string, value: string) => t(`homeSettings.options.${slot}.${value}`)

  const schema = zod
    .object({
      header: zod.enum(SLOT_VALUES.header),
      hero: zod.enum(SLOT_VALUES.hero),
      tiles: zod.enum(SLOT_VALUES.tiles),
      listing: zod.enum(SLOT_VALUES.listing),
      footer: zod.enum(SLOT_VALUES.footer),
    })
    .superRefine((values, ctx) => {
      const settings: StorefrontSettingsInput = { ...doc.settings, ...values }
      for (const slot of BLOCK_SLOTS) {
        const reason = blockedReason(settings, slot, settings[slot])
        if (reason) {
          ctx.addIssue({ code: "custom", path: [slot], message: t(`homeSettings.forbidden.${reason}`) })
        }
      }
    })

  const { header, hero, tiles, listing, footer } = doc.settings

  return (
    <SettingsEditDrawer<BlocksValues>
      title={t("homeSettings.blocks.title")}
      description={t("homeSettings.blocks.subtitle")}
      isPending={isPending}
      schema={schema}
      defaultValues={{ header, hero, tiles, listing, footer }}
      onSubmit={(values) => save((current) => ({ ...current, settings: { ...current.settings, ...values } }))}
      successMessage={t("homeSettings.saved")}
    >
      {(form) => {
        // The choices made in this drawer so far, over the saved mode, decide what is blocked.
        const live = { ...doc.settings, ...form.watch() }

        return BLOCK_SLOTS.map((slot) => {
          const blocked = SLOT_VALUES[slot].flatMap((value) => {
            const reason = value === live[slot] ? null : blockedReason(live, slot, value)
            return reason ? [{ value, reason }] : []
          })

          return (
            <Form.Field
              key={slot}
              control={form.control}
              name={slot}
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t(`homeSettings.slots.${slot}`)}</Form.Label>
                  <Form.Control>
                    <Select {...field} value={value} onValueChange={onChange}>
                      <Select.Trigger ref={ref} data-testid={`home-blocks-${slot}`}>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {SLOT_VALUES[slot].map((item) => (
                          <Select.Item
                            key={item}
                            value={item}
                            disabled={blocked.some((entry) => entry.value === item)}
                          >
                            {option(slot, item)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.Hint>{t(`homeSettings.why.${slot}.${value}`)}</Form.Hint>
                  {blocked.map((entry) => (
                    <Form.Hint key={entry.value}>
                      {t("homeSettings.unavailable", {
                        option: option(slot, entry.value),
                        reason: t(`homeSettings.forbidden.${entry.reason}`),
                      })}
                    </Form.Hint>
                  ))}
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          )
        })
      }}
    </SettingsEditDrawer>
  )
}

export { HomeBlocksEdit as Component }
