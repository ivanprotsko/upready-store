import { Button, Input, Label, Switch, Text } from "@medusajs/ui"

import type { PricingTier } from "../../../lib/platform-pricing-api"
import { ButtonEditor } from "./button-editor"
import { AreaField, Block, ListControls, TextField, move } from "./fields"

/**
 * One tariff card. The id is the tariff's name in `/start` links
 * (`?tariff=start`); renaming it renames the column in every table row too
 * (the page does that in `renameTier`).
 */
export function TierEditor({
  tier,
  index,
  count,
  onChange,
  onRename,
  onMove,
  onRemove,
}: {
  tier: PricingTier
  index: number
  count: number
  onChange: (tier: PricingTier) => void
  onRename: (id: string) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  const setFeatures = (edit: (features: PricingTier["features"]) => void) => {
    const features = tier.features.map((f) => ({ ...f }))
    edit(features)
    onChange({ ...tier, features })
  }

  return (
    <Block
      title={`${index + 1}. ${tier.name || "Без названия"}`}
      actions={<ListControls index={index} count={count} onMove={onMove} onRemove={onRemove} removeLabel="Удалить тариф" />}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <TextField label="Название" value={tier.name} onChange={(name) => onChange({ ...tier, name })} />
        <TextField
          label="Короткое название"
          value={tier.short_name}
          onChange={(short_name) => onChange({ ...tier, short_name })}
          hint="Для вкладок на телефоне; пусто — название"
        />
        <TextField label="Цена" value={tier.price} onChange={(price) => onChange({ ...tier, price })} />
        <TextField
          label="Приписка к цене"
          value={tier.price_note}
          onChange={(price_note) => onChange({ ...tier, price_note })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <TextField
          label="Код тарифа"
          mono
          value={tier.id}
          onChange={onRename}
          hint="Латиница, цифры, дефис; попадает в ссылки /start"
        />
        <div className="flex flex-col gap-y-1">
          <Label size="small">Рекомендуемый</Label>
          <div className="flex h-8 items-center">
            <Switch checked={tier.recommended} onCheckedChange={(recommended) => onChange({ ...tier, recommended })} />
          </div>
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small">Пробный период, дней</Label>
          <Input
            size="small"
            type="number"
            min={1}
            max={365}
            value={tier.trial_days ?? ""}
            placeholder="без пробного периода"
            onChange={(e) =>
              onChange({ ...tier, trial_days: e.target.value === "" ? null : Number.parseInt(e.target.value, 10) })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-y-1">
          <Label size="small">Годовая цена</Label>
          <div className="flex h-8 items-center">
            <Switch
              checked={tier.price_annual !== null}
              onCheckedChange={(on) =>
                onChange({
                  ...tier,
                  price_annual: on ? (tier.price_annual ?? { amount: "", period: "", note: "" }) : null,
                })
              }
            />
          </div>
        </div>
        {tier.price_annual ? (
          <>
            <TextField
              label="Цена в год"
              value={tier.price_annual.amount}
              onChange={(amount) => onChange({ ...tier, price_annual: { ...tier.price_annual!, amount } })}
            />
            <TextField
              label="Период"
              value={tier.price_annual.period}
              onChange={(period) => onChange({ ...tier, price_annual: { ...tier.price_annual!, period } })}
            />
            <TextField
              label="Приписка"
              value={tier.price_annual.note}
              onChange={(note) => onChange({ ...tier, price_annual: { ...tier.price_annual!, note } })}
            />
          </>
        ) : null}
      </div>
      <AreaField label="Описание" value={tier.description} onChange={(description) => onChange({ ...tier, description })} />
      <TextField label="Строка над списком" value={tier.plus} onChange={(plus) => onChange({ ...tier, plus })} />

      <div className="flex flex-col gap-y-2">
        <Label size="small">Пункты карточки</Label>
        {tier.features.map((feature, f) => (
          <div key={f} className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
            <div className="flex items-start gap-x-2">
              <div className="flex-1">
                <TextField
                  label={`Пункт ${f + 1}`}
                  value={feature.text}
                  onChange={(text) => setFeatures((list) => (list[f].text = text))}
                />
              </div>
              <div className="w-16">
                <TextField
                  label="Сноска"
                  value={feature.note}
                  onChange={(note) => setFeatures((list) => (list[f].note = note))}
                  hint="¹²³…, пусто — нет"
                />
              </div>
              <div className="pt-5">
                <ListControls
                  index={f}
                  count={tier.features.length}
                  onMove={(from, to) => setFeatures((list) => move(list, from, to))}
                  onRemove={() => setFeatures((list) => list.splice(f, 1))}
                />
              </div>
            </div>
            <AreaField
              label="Подсказка"
              value={feature.tip}
              onChange={(tip) => setFeatures((list) => (list[f].tip = tip))}
              hint="Открывается справа по клику на пункт; пусто — пункт без подсказки"
            />
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={() => setFeatures((list) => list.push({ text: "Новый пункт", tip: "", note: "" }))}
          >
            Добавить пункт
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        <Text size="small" weight="plus">
          Кнопка
        </Text>
        <ButtonEditor
          button={tier.button}
          tierId={tier.id}
          onChange={(button) => onChange({ ...tier, button })}
          testId={`pricing-button-${index}`}
        />
      </div>
    </Block>
  )
}
