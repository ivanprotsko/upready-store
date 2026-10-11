import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  DataTable,
  FocusModal,
  Heading,
  Input,
  Label,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  toast,
  useDataTable,
} from "@medusajs/ui"

import {
  createTenant,
  listTenants,
  validateHandle,
  type TenantSummary,
} from "../../lib/tenants-api"

const PAGE_SIZE = 20

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

function SalesChannelCell({ tenant }: { tenant: TenantSummary }) {
  if (!tenant.sales_channel) {
    return (
      <StatusBadge color="grey" className="whitespace-nowrap">
        Нет канала
      </StatusBadge>
    )
  }
  if (tenant.sales_channel.is_disabled) {
    return (
      <StatusBadge color="orange" className="whitespace-nowrap">
        Отключён
      </StatusBadge>
    )
  }
  return (
    <StatusBadge color="green" className="whitespace-nowrap">
      Активен
    </StatusBadge>
  )
}

const columnHelper = createDataTableColumnHelper<TenantSummary>()

function useTenantColumns() {
  return useMemo(
    () => [
      columnHelper.accessor("handle", {
        header: "Домен",
        cell: ({ row }) => (
          <div className="flex items-center gap-x-2">
            <span className="font-mono text-ui-fg-subtle">{row.original.handle}</span>
            {row.original.archived_at ? (
              <StatusBadge color="red" className="whitespace-nowrap">
                Архивирован
              </StatusBadge>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("name", {
        header: "Название",
      }),
      columnHelper.display({
        id: "sales_channel",
        header: "Канал продаж",
        cell: ({ row }) => <SalesChannelCell tenant={row.original} />,
      }),
      columnHelper.accessor("products_count", {
        header: "Товары",
      }),
      columnHelper.accessor("orders_count", {
        header: "Заказы",
      }),
      columnHelper.accessor("admins_count", {
        header: "Администраторы",
      }),
      columnHelper.accessor("created_at", {
        header: "Создан",
        cell: ({ getValue }) => formatDate(getValue()),
      }),
    ],
    []
  )
}

function CreateTenantForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const { mutateAsync, isPending } = useMutation({
    mutationFn: createTenant,
  })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError("Укажите название магазина.")
      return
    }
    const handleError = validateHandle(handle)
    if (handleError) {
      setFormError(handleError)
      return
    }
    if (!email.trim()) {
      setFormError("Укажите email первого администратора.")
      return
    }
    if (password.length < 8) {
      setFormError("Пароль должен быть не короче 8 символов.")
      return
    }

    try {
      const tenant = await mutateAsync({
        name: name.trim(),
        handle: handle.trim(),
        admin: {
          email: email.trim(),
          password,
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ["tenants"] })
      toast.success("Магазин создан", { description: `«${tenant.name}» (${tenant.handle})` })
      onClose()
      navigate(`/tenants/${tenant.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Не удалось создать магазин.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
      <FocusModal.Header>
        <Button type="submit" variant="primary" size="small" isLoading={isPending}>
          Создать
        </Button>
      </FocusModal.Header>
      <FocusModal.Body className="flex flex-col items-center overflow-y-auto py-16">
        <div className="flex w-full max-w-lg flex-col gap-y-6">
          <Heading level="h2">Новый магазин</Heading>

          <div className="flex flex-col gap-y-2">
            <Label size="small">Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cool Store" />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label size="small">Домен (handle)</Label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="cool-store"
            />
            <Text size="small" className="text-ui-fg-subtle">
              Строчные латинские буквы, цифры, одиночные дефисы, 3–63 символа. Изменить нельзя после
              создания.
            </Text>
          </div>

          <Text size="small" weight="plus" className="mt-2">
            Первый администратор магазина
          </Text>

          <div className="flex flex-col gap-y-2">
            <Label size="small">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@shop.com"
            />
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

          {formError ? (
            <Text size="small" className="text-ui-fg-error">
              {formError}
            </Text>
          ) : null}
        </div>
      </FocusModal.Body>
    </form>
  )
}

const TenantsListPage = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [pageIndex, setPageIndex] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const offset = pageIndex * PAGE_SIZE

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tenants", { search, offset, showArchived }],
    queryFn: () =>
      listTenants({
        q: search || undefined,
        limit: PAGE_SIZE,
        offset,
        archived: showArchived ? "include" : "exclude",
      }),
    placeholderData: (prev) => prev,
  })

  const columns = useTenantColumns()

  const table = useDataTable({
    data: data?.tenants ?? [],
    columns,
    rowCount: data?.count ?? 0,
    getRowId: (row) => row.id,
    isLoading,
    onRowClick: (_event, row) => navigate(`/tenants/${row.id}`),
    pagination: {
      state: { pageIndex, pageSize: PAGE_SIZE },
      onPaginationChange: (state) => setPageIndex(state.pageIndex),
    },
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPageIndex(0)
      },
    },
  })

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start justify-between gap-y-4 md:flex-row md:items-center">
          <div>
            <Heading level="h1">Магазины</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              Арендаторы платформы: администраторы, каналы продаж, счётчики.
            </Text>
          </div>
          <div className="flex w-full items-center gap-x-2 md:w-auto">
            <DataTable.Search placeholder="Поиск по домену или названию" />
            <Button
              variant={showArchived ? "primary" : "secondary"}
              size="small"
              onClick={() => {
                setShowArchived((v) => !v)
                setPageIndex(0)
              }}
            >
              Показывать архивные
            </Button>
            <FocusModal open={createOpen} onOpenChange={setCreateOpen}>
              <FocusModal.Trigger asChild>
                <Button variant="primary" size="small">
                  Создать магазин
                </Button>
              </FocusModal.Trigger>
              <FocusModal.Content>
                <CreateTenantForm onClose={() => setCreateOpen(false)} />
              </FocusModal.Content>
            </FocusModal>
          </div>
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Магазины",
})

export default TenantsListPage
