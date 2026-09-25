import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"

import {
  PricingApiError,
  getPricing,
  savePricing,
  type PricingDocument,
  type PricingTier,
} from "../../lib/platform-pricing-api"
import { ButtonEditor } from "./components/button-editor"
import { AreaField, Block, ListControls, SelectField, TextField, move } from "./components/fields"
import { ICON_OPTIONS, SectionEditor } from "./components/section-editor"
import { TierEditor } from "./components/tier-editor"

/**
 * «Тарифы»: the editor of the platform's pricing page, `/pricing` on the
 * platform hosts (t-2026-09-25-08). Everything the page shows is here: the
 * tariff cards and their buttons, the comparison table, the tooltips and the
 * page's other texts. The whole page is one document, saved at once; the
 * backend validates it (a 400 names the field) and refuses a save over a newer
 * revision (409), so two editors cannot silently overwrite each other.
 */

/** The select's value for «no tariff»: Radix refuses an empty one, and no tier id can contain `_`. */
const NO_TIER = "__none"

const RICH_HINT = "**жирный** — выделение, Enter — перенос строки"

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Empty chip lines are what a textarea leaves behind; the schema wants none. */
function cleaned(doc: PricingDocument): PricingDocument {
  const next = clone(doc)
  for (const section of next.sections) {
    section.chips = section.chips.map((c) => c.trim()).filter(Boolean)
  }
  return next
}

function uniqueTierId(doc: PricingDocument): string {
  const taken = new Set(doc.tiers.map((t) => t.id))
  let n = doc.tiers.length + 1
  while (taken.has(`tier-${n}`)) n += 1
  return `tier-${n}`
}

const PricingPage = () => {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["platform-pricing"],
    queryFn: getPricing,
  })

  const [doc, setDoc] = useState<PricingDocument | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (data && doc === null) {
      setDoc(data.pricing ? clone(data.pricing) : null)
      setRevision(data.revision)
    }
  }, [data, doc])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: ({ pricing, rev }: { pricing: PricingDocument; rev: number | null }) => savePricing(pricing, rev),
  })

  if (isError) {
    throw error
  }

  if (isLoading || !data) {
    return (
      <Container className="p-6">
        <Text size="small">Загрузка…</Text>
      </Container>
    )
  }

  if (!doc) {
    return (
      <Container className="flex flex-col gap-y-2 p-6">
        <Heading level="h1">Тарифы</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Страница тарифов ещё не заполнена. Заполните её сидом из apps/backend:
        </Text>
        <Text size="small" className="font-mono">
          npx medusa exec ./scripts/fixtures/p01-platform-pricing-seed.ts
        </Text>
      </Container>
    )
  }

  const edit = (fn: (draft: PricingDocument) => void) => {
    setDoc((prev) => {
      if (!prev) return prev
      const next = clone(prev)
      fn(next)
      return next
    })
  }

  const dirty = data.pricing ? JSON.stringify(doc) !== JSON.stringify(data.pricing) : true

  const save = async () => {
    setFormError(null)
    try {
      const saved = await mutateAsync({ pricing: cleaned(doc), rev: revision })
      // The write answers the page and its revision; the preview address is
      // the read's own and stays as it was.
      queryClient.setQueryData(["platform-pricing"], { ...saved, preview_url: data.preview_url })
      setDoc(saved.pricing ? clone(saved.pricing) : null)
      setRevision(saved.revision)
      toast.success("Тарифы сохранены", { description: `Ревизия ${saved.revision}. /pricing уже показывает новое.` })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось сохранить."
      const conflict = err instanceof PricingApiError && err.status === 409
      setFormError(conflict ? `${message} Перезагрузите страницу: ваши правки не сохранены.` : message)
      toast.error(conflict ? "Тарифы уже изменили" : "Не сохранено", { description: message })
    }
  }

  const reset = () => {
    setFormError(null)
    setDoc(data.pricing ? clone(data.pricing) : null)
  }

  const addTier = () =>
    edit((d) => {
      const id = uniqueTierId(d)
      const tier: PricingTier = {
        id,
        name: "Новый тариф",
        short_name: "",
        price: "по запросу",
        price_note: "",
        recommended: false,
        description: "",
        plus: "",
        features: [],
        button: { label: "Выбрать", style: "outline", action: { type: "link", href: "#final" } },
      }
      d.tiers.push(tier)
      for (const section of d.sections) {
        for (const row of section.rows) row.values[id] = { type: "no" }
      }
    })

  const removeTier = (index: number) =>
    edit((d) => {
      const [removed] = d.tiers.splice(index, 1)
      for (const section of d.sections) {
        for (const row of section.rows) delete row.values[removed.id]
      }
      if (d.final.tier_id === removed.id) {
        d.final.tier_id = d.tiers[0]?.id ?? null
      }
    })

  // Every row keys its values by tier id, so an id another tier already has
  // would write this column over that one's. Refused, keystroke by keystroke.
  const renameTier = (index: number, id: string) => {
    if (doc.tiers.some((t, i) => i !== index && t.id === id)) {
      toast.error("Такой код уже у другого тарифа", { description: `«${id}» занят — выберите другой.` })
      return
    }
    edit((d) => {
      const old = d.tiers[index].id
      d.tiers[index].id = id
      for (const section of d.sections) {
        for (const row of section.rows) {
          if (old in row.values) {
            row.values[id] = row.values[old]
            if (id !== old) delete row.values[old]
          }
        }
      }
      if (d.final.tier_id === old) d.final.tier_id = id
    })
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid="platform-pricing-editor">
      <Container className="sticky top-0 z-10 flex flex-col gap-y-3 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Heading level="h1">Тарифы</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Страница /pricing на платформе: карточки, кнопки, таблица сравнения и подсказки.
            {revision ? ` Ревизия ${revision}` : ""}
            {data.updated_at ? `, сохранена ${new Date(data.updated_at).toLocaleString("ru-RU")}` : ""}
            {dirty ? " · есть несохранённые правки" : ""}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-x-2 whitespace-nowrap">
          {data.preview_url ? (
            <Button asChild size="small" variant="secondary">
              <a href={data.preview_url} target="_blank" rel="noreferrer" data-testid="pricing-preview-link">
                Открыть /pricing
              </a>
            </Button>
          ) : null}
          <Button size="small" variant="secondary" disabled={!dirty || isPending} onClick={reset}>
            Отменить правки
          </Button>
          <Button
            size="small"
            variant="primary"
            isLoading={isPending}
            disabled={!dirty}
            onClick={save}
            data-testid="pricing-save"
          >
            Сохранить
          </Button>
        </div>
      </Container>

      {formError ? (
        <Container className="p-4">
          <Text size="small" className="text-ui-fg-error" data-testid="pricing-save-error">
            {formError}
          </Text>
        </Container>
      ) : null}

      <Container className="flex flex-col gap-y-3 p-6">
        <Heading level="h2">Шапка страницы</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TextField
            label="Заголовок вкладки браузера"
            value={doc.page.meta_title}
            onChange={(v) => edit((d) => (d.page.meta_title = v))}
          />
          <TextField label="Надпись над заголовком" value={doc.page.eyebrow} onChange={(v) => edit((d) => (d.page.eyebrow = v))} />
          <TextField
            label="Шапка первой колонки таблицы"
            value={doc.features_label}
            onChange={(v) => edit((d) => (d.features_label = v))}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AreaField label="Заголовок" value={doc.page.title} onChange={(v) => edit((d) => (d.page.title = v))} hint={RICH_HINT} />
          <AreaField label="Текст справа" value={doc.page.note} onChange={(v) => edit((d) => (d.page.note = v))} hint={RICH_HINT} />
        </div>
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Тарифы ({doc.tiers.length})</Heading>
          <Button size="small" variant="secondary" onClick={addTier} disabled={doc.tiers.length >= 6}>
            Добавить тариф
          </Button>
        </div>
        {doc.tiers.map((tier, i) => (
          <TierEditor
            key={i}
            tier={tier}
            index={i}
            count={doc.tiers.length}
            onChange={(next) => edit((d) => (d.tiers[i] = next))}
            onRename={(id) => renameTier(i, id)}
            onMove={(from, to) => edit((d) => move(d.tiers, from, to))}
            onRemove={() => removeTier(i)}
          />
        ))}
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Три блока под карточками</Heading>
          <Button
            size="small"
            variant="secondary"
            disabled={doc.highlights.length >= 6}
            onClick={() => edit((d) => d.highlights.push({ icon: "check", label: "Новый блок", text: "" }))}
          >
            Добавить блок
          </Button>
        </div>
        {doc.highlights.map((item, i) => (
          <Block
            key={i}
            title={`${i + 1}. ${item.label}`}
            actions={
              <ListControls
                index={i}
                count={doc.highlights.length}
                onMove={(from, to) => edit((d) => move(d.highlights, from, to))}
                onRemove={() => edit((d) => d.highlights.splice(i, 1))}
              />
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SelectField label="Значок" value={item.icon} options={ICON_OPTIONS} onChange={(v) => edit((d) => (d.highlights[i].icon = v))} />
              <div className="md:col-span-2">
                <TextField label="Заголовок" value={item.label} onChange={(v) => edit((d) => (d.highlights[i].label = v))} />
              </div>
            </div>
            <AreaField label="Текст" value={item.text} onChange={(v) => edit((d) => (d.highlights[i].text = v))} hint={RICH_HINT} />
          </Block>
        ))}
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Таблица сравнения ({doc.sections.length})</Heading>
          <Button
            size="small"
            variant="secondary"
            onClick={() =>
              edit((d) =>
                d.sections.push({ icon: "box", eyebrow: "Новый блок", heading: "", chips: [], more_chip: "", rows: [] })
              )
            }
          >
            Добавить блок таблицы
          </Button>
        </div>
        {doc.sections.map((section, i) => (
          <SectionEditor
            key={i}
            section={section}
            tiers={doc.tiers}
            index={i}
            count={doc.sections.length}
            onChange={(next) => edit((d) => (d.sections[i] = next))}
            onMove={(from, to) => edit((d) => move(d.sections, from, to))}
            onRemove={() => edit((d) => d.sections.splice(i, 1))}
          />
        ))}
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <Heading level="h2">Панель подсказки</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <TextField label="Надпись сверху" value={doc.drawer.eyebrow} onChange={(v) => edit((d) => (d.drawer.eyebrow = v))} />
          <TextField
            label="Заголовок списка тарифов"
            value={doc.drawer.availability_label}
            onChange={(v) => edit((d) => (d.drawer.availability_label = v))}
          />
          <TextField label="«Есть»" value={doc.drawer.yes_label} onChange={(v) => edit((d) => (d.drawer.yes_label = v))} />
          <TextField label="«Нет»" value={doc.drawer.no_label} onChange={(v) => edit((d) => (d.drawer.no_label = v))} />
          <TextField label="Кнопка закрытия" value={doc.drawer.close_label} onChange={(v) => edit((d) => (d.drawer.close_label = v))} />
        </div>
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Пояснения под таблицей</Heading>
          <Button
            size="small"
            variant="secondary"
            disabled={doc.explainers.length >= 4}
            onClick={() => edit((d) => d.explainers.push({ title: "Новое пояснение", text: "" }))}
          >
            Добавить пояснение
          </Button>
        </div>
        {doc.explainers.map((box, i) => (
          <Block
            key={i}
            title={`${i + 1}. ${box.title}`}
            actions={
              <ListControls
                index={i}
                count={doc.explainers.length}
                onMove={(from, to) => edit((d) => move(d.explainers, from, to))}
                onRemove={() => edit((d) => d.explainers.splice(i, 1))}
              />
            }
          >
            <AreaField label="Заголовок" value={box.title} onChange={(v) => edit((d) => (d.explainers[i].title = v))} hint={RICH_HINT} />
            <AreaField label="Текст" rows={3} value={box.text} onChange={(v) => edit((d) => (d.explainers[i].text = v))} hint={RICH_HINT} />
          </Block>
        ))}
      </Container>

      <Container className="flex flex-col gap-y-3 p-6">
        <Heading level="h2">Финальный блок</Heading>
        <AreaField label="Заголовок" value={doc.final.title} onChange={(v) => edit((d) => (d.final.title = v))} hint={RICH_HINT} />
        <AreaField label="Текст" value={doc.final.text} onChange={(v) => edit((d) => (d.final.text = v))} hint={RICH_HINT} />
        <div className="md:w-1/3">
          <SelectField
            label="Тариф кнопки"
            value={doc.final.tier_id ?? NO_TIER}
            options={[
              { value: NO_TIER, label: "Без тарифа (только для ссылки)" },
              ...doc.tiers.map((t) => ({ value: t.id, label: t.name })),
            ]}
            onChange={(v) => edit((d) => (d.final.tier_id = v === NO_TIER ? null : v))}
          />
        </div>
        <ButtonEditor
          button={doc.final.button}
          tierId={doc.final.tier_id}
          onChange={(button) => edit((d) => (d.final.button = button))}
          testId="pricing-button-final"
        />
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Тарифы",
})

export default PricingPage
