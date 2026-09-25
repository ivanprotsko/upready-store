import { Button, Input, Label } from "@medusajs/ui"

import type { PricingDocument } from "../../../lib/platform-pricing-api"
import { AreaField, Block, ListControls, SelectField, TextField, move } from "./fields"

type Section = PricingDocument["sections"][number]
type Row = Section["rows"][number]
type CellValue = Row["values"][string]
type Tier = PricingDocument["tiers"][number]

export const ICON_OPTIONS: { value: Section["icon"]; label: string }[] = [
  { value: "box", label: "Коробка" },
  { value: "gear", label: "Шестерёнка" },
  { value: "globe", label: "Глобус" },
  { value: "shield", label: "Щит с галочкой" },
  { value: "guard", label: "Щит" },
  { value: "card", label: "Карта" },
  { value: "check", label: "Галочка" },
]

const VALUE_OPTIONS: { value: CellValue["type"]; label: string }[] = [
  { value: "yes", label: "✓ есть" },
  { value: "no", label: "– нет" },
  { value: "text", label: "Текст" },
]

function CellEditor({ tier, value, onChange }: { tier: Tier; value: CellValue | undefined; onChange: (value: CellValue) => void }) {
  const type = value?.type ?? "no"
  return (
    <div className="flex flex-col gap-y-1">
      <SelectField
        label={tier.name}
        value={type}
        options={VALUE_OPTIONS}
        onChange={(next) => onChange(next === "text" ? { type: "text", text: value?.type === "text" ? value.text : "" } : { type: next })}
      />
      {value?.type === "text" ? (
        <Input size="small" value={value.text} onChange={(e) => onChange({ type: "text", text: e.target.value })} />
      ) : null}
    </div>
  )
}

/** One block of the comparison table: its intro, its chips and its rows. */
export function SectionEditor({
  section,
  tiers,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  section: Section
  tiers: Tier[]
  index: number
  count: number
  onChange: (section: Section) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  const setRows = (edit: (rows: Row[]) => void) => {
    const rows = section.rows.map((r) => ({ ...r, values: { ...r.values } }))
    edit(rows)
    onChange({ ...section, rows })
  }

  const newRow = (): Row => ({
    feature: "Новая строка",
    tip: "",
    values: Object.fromEntries(tiers.map((t) => [t.id, { type: "no" } as CellValue])),
  })

  return (
    <Block
      title={`${index + 1}. ${section.eyebrow || "Без названия"}`}
      actions={<ListControls index={index} count={count} onMove={onMove} onRemove={onRemove} removeLabel="Удалить блок" />}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SelectField label="Значок" value={section.icon} options={ICON_OPTIONS} onChange={(icon) => onChange({ ...section, icon })} />
        <div className="md:col-span-2">
          <TextField label="Надпись над заголовком" value={section.eyebrow} onChange={(eyebrow) => onChange({ ...section, eyebrow })} />
        </div>
      </div>
      <AreaField label="Заголовок блока" value={section.heading} onChange={(heading) => onChange({ ...section, heading })} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <AreaField
            label="Плашки, по одной в строке"
            rows={3}
            value={section.chips.join("\n")}
            onChange={(text) => onChange({ ...section, chips: text.split("\n") })}
            hint="Пустые строки при сохранении убираются"
          />
        </div>
        <TextField
          label="Последняя серая плашка"
          value={section.more_chip}
          onChange={(more_chip) => onChange({ ...section, more_chip })}
          hint="Пусто — нет"
        />
      </div>

      <div className="flex flex-col gap-y-2">
        <Label size="small">Строки таблицы</Label>
        {section.rows.map((row, r) => (
          <div key={r} className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
            <div className="flex items-start gap-x-2">
              <div className="flex-1">
                <TextField label={`Строка ${r + 1}`} value={row.feature} onChange={(feature) => setRows((rows) => (rows[r].feature = feature))} />
              </div>
              <div className="pt-5">
                <ListControls
                  index={r}
                  count={section.rows.length}
                  onMove={(from, to) => setRows((rows) => move(rows, from, to))}
                  onRemove={() => setRows((rows) => rows.splice(r, 1))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {tiers.map((tier) => (
                <CellEditor
                  key={tier.id}
                  tier={tier}
                  value={row.values[tier.id]}
                  onChange={(value) => setRows((rows) => (rows[r].values[tier.id] = value))}
                />
              ))}
            </div>
            <AreaField label="Подсказка" value={row.tip} onChange={(tip) => setRows((rows) => (rows[r].tip = tip))} />
          </div>
        ))}
        <div>
          <Button type="button" size="small" variant="secondary" onClick={() => setRows((rows) => rows.push(newRow()))}>
            Добавить строку
          </Button>
        </div>
      </div>
    </Block>
  )
}
