import { useState } from "react"
import { Plus } from "@medusajs/icons"
import { Button, Container, Heading, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { Link, useNavigate } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useCreateTenantCourse, useTenantCourses } from "../../../hooks/api/courses"
import { useProducts } from "../../../hooks/api/products"
import { productsWithoutCourse, productTitleById, STATUS_BADGE_COLOR, STATUS_LABEL } from "../course-labels"

// o24-courses: the owner's course catalogue. Built from the same primitives
// `product-attributes` uses (SingleColumnPage, Container, Table, a quick-add
// row at the bottom) — no separate `/courses/new` screen, since the create
// form here asks for a product and a title, not a raw address (the b18-blog-full
// complaint about the journal's old create form does not apply).

export const CourseList = () => {
  const navigate = useNavigate()
  const { courses, isPending, isError, error } = useTenantCourses()
  const { products, isPending: isProductsPending } = useProducts({
    limit: 200,
    fields: "id,title",
  })

  const [productId, setProductId] = useState("")
  const [title, setTitle] = useState("")
  const { mutateAsync: createCourse, isPending: isCreating } = useCreateTenantCourse()

  if (isError) {
    throw error
  }

  if (isPending || !courses) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const titleById = productTitleById(products ?? [])
  const availableProducts = productsWithoutCourse(products ?? [], courses)

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedTitle = title.trim()

    if (!productId) {
      toast.error("Выберите товар, под которым продаётся курс.")
      return
    }
    if (!trimmedTitle) {
      toast.error("Укажите название курса.")
      return
    }

    await createCourse(
      { product_id: productId, title: trimmedTitle },
      {
        onSuccess: (created) => {
          setProductId("")
          setTitle("")
          toast.success("Курс создан")
          navigate(created.course.id)
        },
        onError: (createError) => toast.error(createError.message),
      }
    )
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={courses}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Курсы</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Онлайн-курс, привязанный к товару: покупатель получает доступ к урокам
            после оплаты. Уроки и их порядок редактируются на странице курса.
          </Text>
        </div>

        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Курс</Table.HeaderCell>
              <Table.HeaderCell>Товар</Table.HeaderCell>
              <Table.HeaderCell>Статус</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {courses.length === 0 ? (
              <Table.Row>
                {/* `Table.Cell` of @medusajs/ui takes no colSpan, so the empty
                    state fills the first cell and the rest stay blank. */}
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle" data-testid="course-empty">
                    Курсов пока нет. Создайте первый — форма ниже.
                  </Text>
                </Table.Cell>
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : null}
            {courses.map((course) => (
              <Table.Row key={course.id} data-testid="course-row">
                <Table.Cell>
                  <Link
                    to={course.id}
                    className="text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                  >
                    <Text size="small" weight="plus" className="truncate" title={course.slug}>
                      {course.title}
                    </Text>
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Text
                    size="small"
                    className="text-ui-fg-subtle truncate"
                    title={titleById.get(course.product_id) ?? "Товар удалён"}
                  >
                    {titleById.get(course.product_id) ?? "Товар удалён"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={STATUS_BADGE_COLOR[course.status]}>
                    {STATUS_LABEL[course.status]}
                  </StatusBadge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>

        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-x-3 gap-y-2 px-6 py-4"
        >
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Товар
            </Text>
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={isProductsPending}
              className="bg-ui-bg-field border-ui-border-base h-8 rounded-md border px-2 text-ui-fg-base txt-compact-small w-[280px]"
              data-testid="course-create-product"
            >
              <option value="">
                {isProductsPending
                  ? "Загрузка…"
                  : availableProducts.length === 0
                    ? "Нет доступных товаров"
                    : "Выберите товар"}
              </option>
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Название курса
            </Text>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Очищение печени"
              className="w-[280px]"
              data-testid="course-create-title"
            />
          </div>
          <Button
            size="small"
            type="submit"
            isLoading={isCreating}
            disabled={availableProducts.length === 0}
            data-testid="course-create-submit"
          >
            <Plus /> Новый курс
          </Button>
          <Text size="small" className="text-ui-fg-subtle basis-full">
            У товара может быть только один курс. Адрес курса и уроки заполняются
            на следующей странице.
          </Text>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
