import { useState } from "react"
import { Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Select,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import {
  REVIEW_STATUSES,
  useDeleteTenantReview,
  useTenantReviews,
  useUpdateTenantReview,
  type ReviewStatus,
  type TenantReview,
} from "../../../hooks/api/reviews"
import { useProducts } from "../../../hooks/api/products"
import {
  REVIEW_SOURCE_LABEL,
  REVIEW_STATUS_COLOR,
  REVIEW_STATUS_HINT,
  REVIEW_STATUS_LABEL,
  formatReviewDate,
  languageLabel,
} from "../labels"

// t09-reviews: the panel's own /reviews screen, no Admin counterpart. The list
// is the moderation queue: a review a customer leaves on the storefront arrives
// «На проверке» and is invisible there until it is published here.

const PAGE_SIZE = 20

const StatusActions = ({ review }: { review: TenantReview }) => {
  const { mutateAsync, isPending } = useUpdateTenantReview(review.id)

  const set = async (status: ReviewStatus) => {
    try {
      await mutateAsync({ status })
      toast.success(
        status === "published"
          ? "Отзыв опубликован — теперь он виден на странице товара"
          : status === "hidden"
            ? "Отзыв скрыт со страницы товара"
            : "Отзыв возвращён на проверку",
      )
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {review.status !== "published" && (
        <Button size="small" variant="secondary" disabled={isPending} onClick={() => set("published")}>
          Опубликовать
        </Button>
      )}
      {review.status === "published" && (
        <Button size="small" variant="secondary" disabled={isPending} onClick={() => set("hidden")}>
          Скрыть
        </Button>
      )}
      {review.status === "hidden" && (
        <Button size="small" variant="transparent" disabled={isPending} onClick={() => set("pending")}>
          Вернуть на проверку
        </Button>
      )}
    </div>
  )
}

const ReplyBox = ({ review }: { review: TenantReview }) => {
  const [value, setValue] = useState(review.reply ?? "")
  const [open, setOpen] = useState(false)
  const { mutateAsync, isPending } = useUpdateTenantReview(review.id)

  const save = async (reply: string | null) => {
    try {
      await mutateAsync({ reply })
      toast.success(reply ? "Ответ сохранён" : "Ответ удалён")
      setOpen(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-y-2">
        {review.reply && (
          <div className="rounded-lg bg-ui-bg-subtle px-3 py-2">
            <Text size="small" weight="plus">
              Ваш ответ
            </Text>
            <Text size="small" className="whitespace-pre-line">
              {review.reply}
            </Text>
          </div>
        )}
        <div>
          <Button size="small" variant="transparent" onClick={() => setOpen(true)}>
            {review.reply ? "Изменить ответ" : "Ответить"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-2">
      <Textarea
        rows={3}
        value={value}
        maxLength={5000}
        placeholder="Ответ магазина — покупатели увидят его под отзывом"
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex gap-2">
        <Button size="small" isLoading={isPending} onClick={() => save(value.trim() || null)}>
          Сохранить
        </Button>
        <Button
          size="small"
          variant="transparent"
          onClick={() => {
            setValue(review.reply ?? "")
            setOpen(false)
          }}
        >
          Отмена
        </Button>
        {review.reply && (
          <Button size="small" variant="transparent" onClick={() => save(null)}>
            Удалить ответ
          </Button>
        )}
      </div>
    </div>
  )
}

const DeleteButton = ({ review }: { review: TenantReview }) => {
  const prompt = usePrompt()
  const { mutateAsync, isPending } = useDeleteTenantReview()

  return (
    <IconButton
      size="small"
      variant="transparent"
      disabled={isPending}
      onClick={async () => {
        const confirmed = await prompt({
          title: "Удалить отзыв?",
          description: `Отзыв «${review.author_name}» исчезнет и из панели, и со страницы товара. Если нужно просто убрать его с витрины — используйте «Скрыть».`,
          confirmText: "Удалить",
          cancelText: "Отмена",
        })
        if (!confirmed) return
        try {
          await mutateAsync(review.id)
          toast.success("Отзыв удалён")
        } catch (error) {
          toast.error((error as Error).message)
        }
      }}
    >
      <Trash />
    </IconButton>
  )
}

export const ReviewList = () => {
  const [status, setStatus] = useState<ReviewStatus | "">("")
  const [productId, setProductId] = useState("")
  const [page, setPage] = useState(0)

  const query = {
    ...(status ? { status } : {}),
    ...(productId ? { product_id: productId } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const { reviews, count, isPending, isError, error } = useTenantReviews(query)
  const { products } = useProducts({ limit: 100, fields: "id,title" })

  if (isError) {
    throw error
  }

  if (isPending || !reviews) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={reviews}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Отзывы</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Отзыв, оставленный покупателем на витрине, попадает сюда со статусом «На проверке» и не виден
            на странице товара, пока вы его не опубликуете. Отзывы, перенесённые из старого магазина, уже
            опубликованы.
          </Text>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Text size="small" weight="plus">
              Статус
            </Text>
            <Select
              value={status || "all"}
              onValueChange={(value) => {
                setStatus(value === "all" ? "" : (value as ReviewStatus))
                setPage(0)
              }}
            >
              <Select.Trigger className="w-56">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">Все</Select.Item>
                {REVIEW_STATUSES.map((value) => (
                  <Select.Item key={value} value={value}>
                    {REVIEW_STATUS_LABEL[value]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          <div className="flex flex-col gap-y-1">
            <Text size="small" weight="plus">
              Товар
            </Text>
            <Select
              value={productId || "all"}
              onValueChange={(value) => {
                setProductId(value === "all" ? "" : value)
                setPage(0)
              }}
            >
              <Select.Trigger className="w-80">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">Все товары</Select.Item>
                {(products ?? []).map((product) => (
                  <Select.Item key={product.id} value={product.id}>
                    {product.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          <Text size="small" className="text-ui-fg-subtle">
            Найдено отзывов: {total}
          </Text>
        </div>

        {reviews.length === 0 ? (
          <div className="px-6 py-8">
            <Text size="small" className="text-ui-fg-subtle">
              {status || productId
                ? "По этому фильтру отзывов нет."
                : "Отзывов пока нет. Они появятся здесь, как только покупатель оставит первый."}
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Товар</Table.HeaderCell>
                <Table.HeaderCell>Отзыв</Table.HeaderCell>
                <Table.HeaderCell>Статус</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {reviews.map((review) => (
                <Table.Row key={review.id}>
                  <Table.Cell className="align-top">
                    <Text size="small" weight="plus">
                      {review.product?.title ?? "Товар удалён"}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {REVIEW_SOURCE_LABEL[review.source]}, {languageLabel(review.language)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="max-w-xl align-top">
                    <div className="flex flex-col gap-y-2 py-2">
                      <Text size="small" weight="plus">
                        {"★".repeat(review.rating)}
                        <span className="text-ui-fg-muted">{"★".repeat(5 - review.rating)}</span>{" "}
                        {review.author_name}
                        <span className="text-ui-fg-subtle">
                          {" "}
                          · {formatReviewDate(review.written_at)}
                        </span>
                      </Text>
                      {review.title && <Text size="small">{review.title}</Text>}
                      <Text size="small" className="whitespace-pre-line text-ui-fg-subtle">
                        {review.body}
                      </Text>
                      <ReplyBox review={review} />
                    </div>
                  </Table.Cell>
                  <Table.Cell className="align-top">
                    <div className="flex flex-col gap-y-2 py-2">
                      <StatusBadge color={REVIEW_STATUS_COLOR[review.status]}>
                        {REVIEW_STATUS_LABEL[review.status]}
                      </StatusBadge>
                      <Text size="small" className="text-ui-fg-subtle">
                        {REVIEW_STATUS_HINT[review.status]}
                      </Text>
                      <StatusActions review={review} />
                    </div>
                  </Table.Cell>
                  <Table.Cell className="align-top">
                    <div className="py-2">
                      <DeleteButton review={review} />
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-end gap-x-3 px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Страница {page + 1} из {pages}
            </Text>
            <Button
              size="small"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Назад
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={page + 1 >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Вперёд
            </Button>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  )
}
