import { XMark } from "@medusajs/icons"
import { Button, IconButton, Input, Select } from "@medusajs/ui"
import { UseFormReturn, useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SettingsEditDrawer } from "../../../../components/settings"
import {
  useHreflangSisters,
  useUpdateHreflangSisters,
} from "../../../../hooks/api/hreflang-sisters"
import { LOCALE_CODES, LOCALE_LABELS } from "../../../../lib/locale-catalog"

// t-2026-10-14-01 (panel redesign, G2): the sister sites on other servers
// (t-cherk-31, Ivan's Р2 fork, `.ru` and `.com` on different servers), which
// used to be edited in place on `/settings/sites`, in the drawer of their
// section on this site's card. A row with no domain is dropped on save, the
// way the inline rows were; `PUT /tenants/hreflang-sisters` replaces the list.

const SistersSchema = zod.object({
  sisters: zod.array(
    zod.object({
      domain: zod.string().trim(),
      locale: zod.string(),
    })
  ),
})

type SistersValues = zod.infer<typeof SistersSchema>

const SistersFields = ({ form }: { form: UseFormReturn<SistersValues> }) => {
  const { t } = useTranslation()
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "sisters" })

  return (
    <>
      {fields.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,160px)_28px] items-end gap-x-2">
          <Form.Field
            control={form.control}
            name={`sisters.${index}.domain`}
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("sites.sisters.domain")}</Form.Label>
                <Form.Control>
                  <Input {...field} className="font-mono" placeholder={t("sites.sisters.domainPlaceholder")} />
                </Form.Control>
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name={`sisters.${index}.locale`}
            render={({ field: { value, onChange, ref, ...field } }) => (
              <Form.Item>
                <Form.Label>{t("sites.sisters.locale")}</Form.Label>
                <Form.Control>
                  <Select {...field} value={value} onValueChange={onChange}>
                    <Select.Trigger ref={ref}>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {LOCALE_CODES.map((code) => (
                        <Select.Item key={code} value={code}>
                          {LOCALE_LABELS[code]}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </Form.Control>
              </Form.Item>
            )}
          />
          <IconButton
            size="small"
            variant="transparent"
            type="button"
            className="mb-1"
            aria-label={t("sites.sisters.remove")}
            onClick={() => remove(index)}
          >
            <XMark />
          </IconButton>
        </div>
      ))}
      <Button
        size="small"
        variant="secondary"
        type="button"
        className="self-start"
        onClick={() => append({ domain: "", locale: "en" })}
      >
        {t("sites.sisters.add")}
      </Button>
    </>
  )
}

export const SiteSistersEdit = () => {
  const { t } = useTranslation()
  const { sisters, isPending, isError, error } = useHreflangSisters()
  const { mutateAsync: save } = useUpdateHreflangSisters()

  if (isError) {
    throw error
  }

  return (
    <SettingsEditDrawer
      title={t("sites.sisters.title")}
      description={t("sites.sisters.hint")}
      isPending={isPending}
      schema={SistersSchema}
      defaultValues={{ sisters: sisters ?? [] }}
      onSubmit={(values) =>
        save({ sisters: values.sisters.filter((sister) => sister.domain.length > 0) })
      }
      successMessage={t("sites.sisters.saved")}
    >
      {(form) => <SistersFields form={form} />}
    </SettingsEditDrawer>
  )
}
