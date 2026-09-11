import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Drawer, Input, Label, Text, toast } from "@medusajs/ui"

import { updateTenantAdmin, type TenantAdmin } from "../../../../lib/tenants-api"

export function EditAdminDrawer({
  tenantId,
  admin,
  open,
  onOpenChange,
}: {
  tenantId: string
  admin: TenantAdmin
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(admin.email)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const input: { email?: string; password?: string } = {}
    if (email.trim() && email.trim() !== admin.email) {
      input.email = email.trim()
    }
    if (password.length > 0) {
      if (password.length < 8) {
        setError("Пароль должен быть не короче 8 символов.")
        return
      }
      input.password = password
    }
    if (!input.email && !input.password) {
      setError("Измените email или пароль перед сохранением.")
      return
    }

    setIsPending(true)
    try {
      await updateTenantAdmin(tenantId, admin.id, input)
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] })
      toast.success("Данные администратора обновлены")
      setPassword("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить изменения.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Сменить email и пароль</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label size="small">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Новый пароль</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="оставьте пустым, чтобы не менять"
              />
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
