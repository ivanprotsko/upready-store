import { RadioGroup, Select } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../components/common/form"
import { SettingsEditDrawer } from "../../components/settings"
import { type Mode, SLOT_VALUES, THEME_PRESETS, type ThemePreset, blockedReason } from "./composition"
import { useHomeDocument } from "./use-home-edit"

// t-2026-10-14-01 (panel redesign, G4, prototype state `home-theme-edit`):
// the drawer of the first section — the palette and what a visitor who never
// switched sees. The «светлая / тёмная по умолчанию» choice moved here from
// «Блоки» (lead's decision: it is a property of the colours, not of the
// composition). Route `theme/edit`.

type ThemeValues = { preset: ThemePreset; defaultMode: Mode }

export const HomeThemeEdit = () => {
  const { t } = useTranslation()
  const { doc, isPending, save } = useHomeDocument()

  // The footer is not edited here: a mode it forbids is refused under the choice and by zod.
  const reasonFor = (mode: Mode) => blockedReason(doc.settings, "defaultMode", mode)

  const schema = zod
    .object({ preset: zod.enum(THEME_PRESETS), defaultMode: zod.enum(["light", "dark"]) })
    .superRefine((values, ctx) => {
      const reason = reasonFor(values.defaultMode)
      if (reason) {
        ctx.addIssue({ code: "custom", path: ["defaultMode"], message: t(`homeSettings.forbidden.${reason}`) })
      }
    })

  return (
    <SettingsEditDrawer<ThemeValues>
      title={t("homeSettings.theme.edit")}
      description={t("homeSettings.theme.subtitle")}
      isPending={isPending}
      schema={schema}
      defaultValues={{ preset: doc.theme.preset, defaultMode: doc.settings.defaultMode }}
      onSubmit={(values) =>
        save((current) => ({
          ...current,
          theme: { ...current.theme, preset: values.preset },
          settings: { ...current.settings, defaultMode: values.defaultMode },
        }))
      }
      successMessage={t("homeSettings.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="preset"
            render={({ field: { value, onChange, ref, ...field } }) => (
              <Form.Item>
                <Form.Label>{t("homeSettings.theme.palette")}</Form.Label>
                <Form.Control>
                  <Select {...field} value={value} onValueChange={onChange}>
                    <Select.Trigger ref={ref} data-testid="home-theme-preset">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {THEME_PRESETS.map((preset) => (
                        <Select.Item key={preset} value={preset}>
                          {t(`homeSettings.palettes.${preset}`)}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </Form.Control>
                <Form.Hint>{t("homeSettings.theme.paletteHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="defaultMode"
            render={({ field: { value, onChange, ref, ...field } }) => (
              <Form.Item>
                <Form.Label>{t("homeSettings.theme.defaultMode")}</Form.Label>
                <Form.Control>
                  <RadioGroup
                    {...field}
                    ref={ref}
                    value={value}
                    onValueChange={onChange}
                    className="flex flex-col gap-y-3"
                  >
                    {SLOT_VALUES.defaultMode.map((mode) => {
                      const reason = reasonFor(mode)
                      return (
                        <RadioGroup.ChoiceBox
                          key={mode}
                          value={mode}
                          disabled={!!reason && mode !== value}
                          label={t(`homeSettings.options.defaultMode.${mode}`)}
                          description={
                            reason ? t(`homeSettings.forbidden.${reason}`) : t(`homeSettings.why.defaultMode.${mode}`)
                          }
                        />
                      )
                    })}
                  </RadioGroup>
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { HomeThemeEdit as Component }
