import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Drawer, Input, Label, Select, Text, toast } from "@medusajs/ui"

import { createTenantAdmin } from "../../../../lib/tenants-api"
import {
  DEFAULT_TENANT_ADMIN_ROLE,
  TENANT_ADMIN_ROLES,
  isTenantAdminRole,
  type TenantAdminRole,
} from "./admin-roles"

export function AddAdminDrawer({
  tenantId,
  open,
  onOpenChange,
}: {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState<TenantAdminRole>(DEFAULT_TENANT_ADMIN_ROLE)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError("Укажите email.")
      return
    }
    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.")
      return
    }
    setIsPending(true)
    try {
      await createTenantAdmin(tenantId, {
        email: email.trim(),
        password,
        role,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] })
      toast.success("Администратор добавлен")
      setEmail("")
      setPassword("")
      setFirstName("")
      setLastName("")
      setRole(DEFAULT_TENANT_ADMIN_ROLE)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить администратора.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Добавить администратора</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label size="small">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Пароль</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="не короче 8 символов"
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Роль</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  if (isTenantAdminRole(value)) setRole(value)
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {TENANT_ADMIN_ROLES.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <div className="flex flex-col gap-y-2">
                <Label size="small">Имя</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label size="small">Фамилия</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
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
              Добавить
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}
