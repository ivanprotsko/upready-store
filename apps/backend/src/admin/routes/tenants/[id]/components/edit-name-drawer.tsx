import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Drawer, Input, Label, Text, toast } from "@medusajs/ui"

import { updateTenant, type TenantDetail } from "../../../../lib/tenants-api"

export function EditNameDrawer({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: TenantDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(tenant.name)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError("Название не может быть пустым.")
      return
    }
    setIsPending(true)
    try {
      await updateTenant(tenant.id, { name: name.trim() })
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenant.id] })
      await queryClient.invalidateQueries({ queryKey: ["tenants"] })
      toast.success("Название сохранено")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Изменить название</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label size="small">Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {error ? (
              <Text size="small" className="text-ui-fg-error">
                {error}
              </Text>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button variant="secondary" size="small" type="button">
                Отмена
              </Button>
            </Drawer.Close>
            <Button variant="primary" size="small" type="submit" isLoading={isPending}>
              Сохранить
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}
