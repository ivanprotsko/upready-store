import { useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, Button, Container, Copy, Heading, StatusBadge, Text, toast, usePrompt } from "@medusajs/ui"

import { deleteTenant, exportTenant, getTenant } from "../../../lib/tenants-api"
import { Field } from "./components/field"
import { EditNameDrawer } from "./components/edit-name-drawer"
import { AdminsSection } from "./components/admins-section"

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const TenantDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [editNameOpen, setEditNameOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const {
    data: tenant,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["tenant", id],
    queryFn: () => getTenant(id as string),
    enabled: Boolean(id),
  })

  if (!id) {
    return null
  }

  if (isError) {
    throw error
  }

  const handleExport = async () => {
    if (!tenant) return
    setIsExporting(true)
    try {
      await exportTenant(tenant.id, tenant.handle)
      toast.success("Выгрузка началась", { description: "Файл сохраняется в загрузки браузера." })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось выгрузить магазин.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleDelete = async () => {
    if (!tenant) return
    const confirmed = await prompt({
      title: "Удалить магазин?",
      description: `Магазин «${tenant.name}» (${tenant.handle}) будет архивирован: канал продаж отключится, публикуемый ключ отзовётся, вход администраторов магазина закроется. Действие необратимо через эту панель.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "danger",
    })
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await deleteTenant(tenant.id)
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenant.id] })
      await queryClient.invalidateQueries({ queryKey: ["tenants"] })
      toast.success("Магазин архивирован")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить магазин.")
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading || !tenant) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-subtle">
          Загрузка…
        </Text>
      </Container>
    )
  }

  const archived = Boolean(tenant.archived_at)

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-x-3">
            <Heading level="h1">{tenant.name}</Heading>
            {archived ? (
              <StatusBadge color="red">Архивирован</StatusBadge>
            ) : (
              <StatusBadge color="green">Активен</StatusBadge>
            )}
          </div>
          <div className="flex items-center gap-x-2">
            <Button variant="secondary" size="small" onClick={() => setEditNameOpen(true)}>
              Изменить название
            </Button>
            <Button variant="secondary" size="small" isLoading={isExporting} onClick={handleExport}>
              Выгрузить
            </Button>
            <Button
              variant="danger"
              size="small"
              disabled={archived}
              isLoading={isDeleting}
              onClick={handleDelete}
            >
              Удалить магазин
            </Button>
          </div>
        </div>

        <Field label="Домен">
          <span className="font-mono">{tenant.handle}</span>
        </Field>
        <Field label="Создан">{dateFormatter.format(new Date(tenant.created_at))}</Field>
        <Field label="Канал продаж">
          {tenant.sales_channel ? (
            <div className="flex items-center justify-end gap-x-2">
              <span>{tenant.sales_channel.name}</span>
              <Badge size="2xsmall" color={tenant.sales_channel.is_disabled ? "orange" : "green"}>
                {tenant.sales_channel.is_disabled ? "отключён" : "активен"}
              </Badge>
            </div>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Публикуемый ключ">
          {tenant.api_key ? (
            <div className="flex items-center justify-end gap-x-2">
              <span className="font-mono text-xs">
                {tenant.api_key.token.slice(0, 10)}…{tenant.api_key.token.slice(-4)}
              </span>
              <Copy content={tenant.api_key.token} variant="mini" />
              {tenant.api_key.revoked_at ? (
                <Badge size="2xsmall" color="red">
                  отозван
                </Badge>
              ) : null}
            </div>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Товары">{tenant.products_count}</Field>
        <Field label="Заказы">{tenant.orders_count}</Field>
        <Field label="Администраторы">{tenant.admins_count}</Field>
      </Container>

      <AdminsSection tenant={tenant} />

      <EditNameDrawer tenant={tenant} open={editNameOpen} onOpenChange={setEditNameOpen} />
    </div>
  )
}

export default TenantDetailPage
