import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Container, Heading, Table, toast, usePrompt } from "@medusajs/ui"

import { deleteTenantAdmin, type TenantAdmin, type TenantDetail } from "../../../../lib/tenants-api"
import { AddAdminDrawer } from "./add-admin-drawer"
import { EditAdminDrawer } from "./edit-admin-drawer"

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function AdminsSection({ tenant }: { tenant: TenantDetail }) {
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [addOpen, setAddOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<TenantAdmin | null>(null)

  const handleRemove = async (admin: TenantAdmin) => {
    const confirmed = await prompt({
      title: "Удалить администратора?",
      description: `«${admin.email}» потеряет доступ к магазину «${tenant.name}». Последнего администратора удалить нельзя.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "danger",
    })
    if (!confirmed) return

    try {
      await deleteTenantAdmin(tenant.id, admin.id)
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenant.id] })
      toast.success("Администратор удалён")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить администратора.")
    }
  }

  const disabled = Boolean(tenant.archived_at)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Администраторы</Heading>
        <Button variant="secondary" size="small" disabled={disabled} onClick={() => setAddOpen(true)}>
          Добавить администратора
        </Button>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Email</Table.HeaderCell>
            <Table.HeaderCell>Имя</Table.HeaderCell>
            <Table.HeaderCell>Создан</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {tenant.admins.map((admin) => (
            <Table.Row key={admin.id}>
              <Table.Cell>{admin.email}</Table.Cell>
              <Table.Cell>
                {[admin.first_name, admin.last_name].filter(Boolean).join(" ") || "—"}
              </Table.Cell>
              <Table.Cell>{dateFormatter.format(new Date(admin.created_at))}</Table.Cell>
              <Table.Cell>
                <div className="flex justify-end gap-x-2">
                  <Button
                    variant="transparent"
                    size="small"
                    disabled={disabled}
                    onClick={() => setEditingAdmin(admin)}
                  >
                    Изменить
                  </Button>
                  <Button
                    variant="transparent"
                    size="small"
                    disabled={disabled}
                    onClick={() => handleRemove(admin)}
                  >
                    Удалить
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <AddAdminDrawer tenantId={tenant.id} open={addOpen} onOpenChange={setAddOpen} />
      {editingAdmin ? (
        <EditAdminDrawer
          tenantId={tenant.id}
          admin={editingAdmin}
          open={Boolean(editingAdmin)}
          onOpenChange={(open) => {
            if (!open) setEditingAdmin(null)
          }}
        />
      ) : null}
    </Container>
  )
}
