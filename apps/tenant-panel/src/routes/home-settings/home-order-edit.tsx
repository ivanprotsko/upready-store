import { Label, Switch, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../components/common/form"
import { SortableList } from "../../components/common/sortable-list"
import { SettingsEditDrawer } from "../../components/settings"
import { HOME_BLOCKS, type HomeBlock } from "./composition"
import { useHomeDocument } from "./use-home-edit"

// t-2026-10-14-01 (panel redesign, G4, prototype state `home-order-edit`): the
// order of the blocks under the header. A block is dragged by its handle
// (`SortableList`, the list the course lessons use) and switched off with its
// switch; a block switched off leaves `order` — which is what keeps it off the
// storefront — and waits under «Скрыто», where its switch brings it back last.
// One block always stays, as the arrows-and-«Скрыть» list before allowed.
// Route `order/edit`.

const schema = zod.object({ order: zod.array(zod.enum(HOME_BLOCKS)) })

type OrderValues = zod.infer<typeof schema>

const Row = ({
  block,
  number,
  checked,
  disabled,
  onCheckedChange,
}: {
  block: HomeBlock
  number?: number
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) => {
  const { t } = useTranslation()
  const name = t(`homeSettings.order.blocks.${block}`)

  return (
    <div className="flex w-full items-center gap-x-3 px-3 py-2" data-testid={`home-order-row-${block}`}>
      {number ? (
        <>
          <SortableList.DragHandle />
          <Text size="small" leading="compact" className="w-4 text-right tabular-nums text-ui-fg-subtle">
            {number}
          </Text>
        </>
      ) : null}
      <Label size="small" weight="plus" htmlFor={`home-order-${block}`} className="flex-1">
        {name}
      </Label>
      <Switch
        id={`home-order-${block}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={t("homeSettings.order.show", { block: name })}
      />
    </div>
  )
}

export const HomeOrderEdit = () => {
  const { t } = useTranslation()
  const { doc, isPending, save } = useHomeDocument()

  return (
    <SettingsEditDrawer<OrderValues>
      title={t("homeSettings.order.edit")}
      description={t("homeSettings.order.subtitle")}
      isPending={isPending}
      schema={schema}
      defaultValues={{ order: doc.content.order }}
      onSubmit={(values) => save((current) => ({ ...current, content: { ...current.content, order: values.order } }))}
      successMessage={t("homeSettings.saved")}
    >
      {(form) => (
        <Form.Field
          control={form.control}
          name="order"
          render={({ field: { value: order, onChange } }) => {
            const hidden = HOME_BLOCKS.filter((block) => !order.includes(block))

            return (
              <div className="flex flex-col gap-y-6">
                <Text size="small" className="text-ui-fg-subtle">
                  {t("homeSettings.order.hint")}
                </Text>
                <div className="overflow-hidden rounded-lg shadow-elevation-card-rest" data-testid="home-order-list">
                  <SortableList
                    items={order.map((block) => ({ id: block }))}
                    onChange={(items) => onChange(items.map((item) => item.id))}
                    renderItem={(item, index) => (
                      <SortableList.Item id={item.id} className="border-b bg-ui-bg-component last:border-b-0">
                        <Row
                          block={item.id}
                          number={index + 1}
                          checked
                          // One block always stays on the home page.
                          disabled={order.length === 1}
                          onCheckedChange={() => onChange(order.filter((block) => block !== item.id))}
                        />
                      </SortableList.Item>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">
                    {t("homeSettings.order.hidden")}
                  </Text>
                  <div className="overflow-hidden rounded-lg border border-dashed border-ui-border-strong">
                    {hidden.length ? (
                      hidden.map((block) => (
                        <Row
                          key={block}
                          block={block}
                          checked={false}
                          onCheckedChange={() => onChange([...order, block])}
                        />
                      ))
                    ) : (
                      <Text size="small" className="px-3 py-2 text-ui-fg-muted">
                        {t("homeSettings.order.hiddenEmpty")}
                      </Text>
                    )}
                  </div>
                </div>
              </div>
            )
          }}
        />
      )}
    </SettingsEditDrawer>
  )
}

export { HomeOrderEdit as Component }
