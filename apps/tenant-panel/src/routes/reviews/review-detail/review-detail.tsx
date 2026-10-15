import { EllipsisHorizontal } from "@medusajs/icons"
import { Button, Heading, IconButton, StatusBadge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { SectionRow } from "../../../components/common/section"
import { RouteDrawer } from "../../../components/modals"
import { useTenantReview, type TenantReview } from "../../../hooks/api/reviews"
import { useDate } from "../../../hooks/use-date"
import { ReviewStars } from "../components/review-stars"
import {
  REVIEW_STATUS_COLOR,
  reviewOrigin,
  reviewStatusHint,
  reviewStatusLabel,
} from "../labels"
import { useReviewActions } from "../use-review-actions"

// t-2026-10-14-01 (panel redesign, G5, prototype state `reviews-view`): one
// review read in a drawer on its own address, /reviews/:id, opened by a click
// on its row. Read rows only; the one primary action is «Ответить» in the
// footer, and publishing, hiding and deleting are the same «…» as the row's,
// in the drawer's header.

const DrawerMenu = ({ review, search }: { review: TenantReview; search: string }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { groups } = useReviewActions(review, {
    onDeleted: () => navigate(`/reviews${search}`, { replace: true }),
  })

  return (
    <ActionMenu groups={groups({})}>
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

const ReviewRows = ({ review }: { review: TenantReview }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const text = [review.title, review.body].filter(Boolean).join("\n")

  return (
    <div className="divide-y" data-testid="review-detail">
      <SectionRow
        title={t("reviews.columns.product")}
        value={
          review.product ? (
            <Link
              to={`/products/${review.product.id}`}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small"
            >
              {review.product.title}
            </Link>
          ) : (
            t("reviews.productGone")
          )
        }
      />
      <SectionRow
        title={t("reviews.columns.author")}
        value={
          <div className="flex flex-col">
            <Text size="small" leading="compact">
              {review.author_name}
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {reviewOrigin(t, review.source, review.language)}
            </Text>
          </div>
        }
      />
      <SectionRow
        title={t("reviews.columns.rating")}
        value={
          <div className="flex items-center gap-x-2">
            <ReviewStars rating={review.rating} />
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("reviews.ratingOf", { rating: review.rating })}
            </Text>
          </div>
        }
      />
      <SectionRow
        title={t("reviews.columns.date")}
        value={review.written_at ? getFullDate({ date: review.written_at }) : t("reviews.dateUnknown")}
      />
      <SectionRow
        title={t("reviews.columns.status")}
        value={
          <div className="flex flex-col items-start gap-y-1">
            <StatusBadge color={REVIEW_STATUS_COLOR[review.status]}>
              {reviewStatusLabel(t, review.status)}
            </StatusBadge>
            <Text size="small" leading="compact" className="text-ui-fg-subtle text-pretty">
              {reviewStatusHint(t, review.status)}
            </Text>
          </div>
        }
      />
      <SectionRow title={t("reviews.detail.text")} value={text} />
      <SectionRow
        title={t("reviews.detail.reply")}
        value={
          review.reply ? (
            review.reply
          ) : (
            <Text size="small" leading="compact" className="text-ui-fg-muted">
              {t("reviews.detail.noReply")}
            </Text>
          )
        }
      />
    </div>
  )
}

export const ReviewDetail = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const { search } = useLocation()
  const { review, isPending, isError, error } = useTenantReview(id!)

  if (isError) {
    throw error
  }

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Title asChild>
            <Heading>{t("reviews.detail.title")}</Heading>
          </RouteDrawer.Title>
          {review ? <DrawerMenu review={review} search={search} /> : null}
        </div>
        <RouteDrawer.Description className="sr-only">
          {t("reviews.detail.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <RouteDrawer.Body className="overflow-y-auto p-0">
        {isPending || !review ? null : <ReviewRows review={review} />}
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center justify-end gap-x-2" data-block="review-drawer-footer">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.close")}
            </Button>
          </RouteDrawer.Close>
          {review ? (
            <Button size="small" asChild>
              <Link to={`/reviews/${review.id}/reply${search}`}>
                {review.reply ? t("reviews.actions.editReply") : t("reviews.actions.reply")}
              </Link>
            </Button>
          ) : null}
        </div>
      </RouteDrawer.Footer>
    </RouteDrawer>
  )
}
