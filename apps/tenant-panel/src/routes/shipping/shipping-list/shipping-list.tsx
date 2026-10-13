import { useEffect, useState } from "react"
import { ArrowDownMini, ArrowUpMini, PencilSquare, Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  StatusBadge,
  Switch,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { TableScroll } from "../../../components/table/table-scroll"
import {
  useDeleteShippingMethod,
  useReorderShippingMethods,
  useShippingMethods,
  useUpdateShippingMethod,
  useUpdateShippingSettings,
  type TenantShippingMethod,
} from "../../../hooks/api/shipping-methods"
import {
  TARIFF_KIND_LABEL,
  carrierLabel,
  methodZoneSummary,
  tariffSummary,
} from "../labels"

// t04-shipping-tariffs: the panel's own /shipping screen, no Admin
// counterpart. The list IS the order the checkout shows the methods in; the
// arrows call POST /tenants/shipping-methods/reorder with the whole list.

const EnabledSwitch = ({ method }: { method: TenantShippingMethod }) => {
  const { mutateAsync, isPending } = useUpdateShippingMethod(method.id)
  return (
    <Switch
      checked={method.enabled}
      disabled={isPending}
      onCheckedChange={async (enabled) => {
        try {
          await mutateAsync({ enabled })
          toast.success(enabled ? "Способ включён" : "Способ выключен")
        } catch (error) {
          toast.error((error as Error).message)
        }
      }}
    />
  )
}

const DeleteButton = ({ method }: { method: TenantShippingMethod }) => {
  const prompt = usePrompt()
  const { mutateAsync, isPending } = useDeleteShippingMethod()
  return (
    <IconButton
      size="small"
      variant="transparent"
      disabled={isPending}
      onClick={async () => {
        const confirmed = await prompt({
          title: "Удалить способ доставки?",
          description: `«${method.name}» исчезнет из оформления заказа. Уже сделанные заказы сохранят его название.`,
          confirmText: "Удалить",
          cancelText: "Отмена",
        })
        if (!confirmed) {
          return
        }
        try {
          await mutateAsync(method.id)
          toast.success("Способ доставки удалён")
        } catch (error) {
          toast.error((error as Error).message)
        }
      }}
    >
      <Trash />
    </IconButton>
  )
}

const DefaultWeightForm = ({
  defaultWeightG,
}: {
  defaultWeightG: number
}) => {
  const [value, setValue] = useState(String(defaultWeightG))
  const { mutateAsync, isPending } = useUpdateShippingSettings()

  useEffect(() => {
    setValue(String(defaultWeightG))
  }, [defaultWeightG])

  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100000
  const dirty = parsed !== defaultWeightG

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Вес товара по умолчанию</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Для тарифов по весу. Если у товара в карточке вес не указан, каждая его единица считается по этому
          весу. Укажите вес у товаров, чтобы цена доставки была точной.
        </Text>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 px-6 py-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) {
            return
          }
          try {
            await mutateAsync({ default_weight_g: parsed })
            toast.success(`Вес по умолчанию: ${parsed} г`)
          } catch (error) {
            toast.error((error as Error).message)
          }
        }}
      >
        <div className="flex flex-col gap-y-1">
          <Text size="small" weight="plus">
            Граммов за единицу товара
          </Text>
          <Input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-40"
            aria-invalid={!valid}
          />
        </div>
        <Button size="small" type="submit" disabled={!valid || !dirty} isLoading={isPending}>
          Сохранить
        </Button>
        {!valid && (
          <Text size="small" className="text-ui-fg-error">
            Целое число от 1 до 100 000
          </Text>
        )}
      </form>
    </Container>
  )
}

export const ShippingList = () => {
  const { methods, settings, isPending, isError, error } = useShippingMethods()
  const { mutateAsync: reorder, isPending: isReordering } = useReorderShippingMethods()

  if (isError) {
    throw error
  }

  if (isPending || !methods || !settings) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= methods.length) {
      return
    }
    const ids = methods.map((method) => method.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await reorder(ids)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={methods}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h2">Доставка</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Способы доставки, которые покупатель выбирает при оформлении заказа, в этом порядке. Название
              покупатель видит слово в слово.
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <Button size="small" variant="secondary" asChild>
              <Link to="zones">Зоны по России</Link>
            </Button>
            <Button size="small" variant="secondary" asChild>
              <Link to="create">Добавить способ</Link>
            </Button>
          </div>
        </div>
        {methods.length === 0 ? (
          <div className="px-6 py-8">
            <Text size="small" className="text-ui-fg-subtle">
              Способов доставки пока нет. Пока их нет, покупатель не сможет оформить заказ. Быстрее всего
              начать с кнопки «Зоны по России»: она создаст по способу на каждую зону с ценой за килограмм.
            </Text>
          </div>
        ) : (
          <TableScroll>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell className="w-24">Порядок</Table.HeaderCell>
                  <Table.HeaderCell>Название</Table.HeaderCell>
                  <Table.HeaderCell>Куда</Table.HeaderCell>
                  <Table.HeaderCell>Цена</Table.HeaderCell>
                  <Table.HeaderCell>Срок</Table.HeaderCell>
                  <Table.HeaderCell>Показывать</Table.HeaderCell>
                  <Table.HeaderCell className="w-24" />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {methods.map((method, index) => (
                  <Table.Row key={method.id} data-testid={`shipping-method-${method.id}`}>
                    <Table.Cell>
                      <div className="flex items-center gap-x-1">
                        <IconButton
                          size="small"
                          variant="transparent"
                          disabled={index === 0 || isReordering}
                          onClick={() => move(index, -1)}
                          aria-label="Выше"
                        >
                          <ArrowUpMini />
                        </IconButton>
                        <IconButton
                          size="small"
                          variant="transparent"
                          disabled={index === methods.length - 1 || isReordering}
                          onClick={() => move(index, 1)}
                          aria-label="Ниже"
                        >
                          <ArrowDownMini />
                        </IconButton>
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      title={
                        [
                          carrierLabel(method.carrier) ? `Служба: ${carrierLabel(method.carrier)}` : null,
                          method.description,
                        ]
                          .filter(Boolean)
                          .join(" — ") || undefined
                      }
                    >
                      <Text size="small" weight="plus" className="truncate">
                        {method.name}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" className="truncate">
                        {methodZoneSummary(method)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell
                      title={
                        [
                          TARIFF_KIND_LABEL[method.tariff.kind],
                          method.tariff_source === "provisioned-default"
                            ? "Стоимость по умолчанию — укажите свою"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" — ")
                      }
                    >
                      <Text size="small" className="truncate">
                        {tariffSummary(method.tariff, method.currency_code)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{method.delivery_hint ?? "—"}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-x-2">
                        <EnabledSwitch method={method} />
                        <StatusBadge color={method.enabled ? "green" : "grey"}>
                          {method.enabled ? "Да" : "Нет"}
                        </StatusBadge>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-x-1">
                        <IconButton size="small" variant="transparent" asChild>
                          <Link to={`${method.id}/edit`} aria-label="Изменить">
                            <PencilSquare />
                          </Link>
                        </IconButton>
                        <DeleteButton method={method} />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </TableScroll>
        )}
      </Container>
      <DefaultWeightForm defaultWeightG={settings.default_weight_g} />
    </SingleColumnPage>
  )
}
