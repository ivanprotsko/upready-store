import { ArrowUpRightOnBox, PencilSquare, Trash } from "@medusajs/icons"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { SettingsDetailSection, type SettingsSection } from "../../../components/settings"
import { useTenantCourse, type TenantCourse, type TenantLesson } from "../../../hooks/api/courses"
import { useDomains } from "../../../hooks/api/domains"
import { useTenantLocaleSettings } from "../../../hooks/api/locale-settings"
import { useProduct } from "../../../hooks/api/products"
import { useDate } from "../../../hooks/use-date"
import { buildCourseStorefrontUrl, STATUS_BADGE_COLOR, STATUS_LABEL_KEY } from "../course-labels"
import { useCourseDelete } from "../use-course-delete"
import { CourseLessonsSection } from "./course-lessons-section"
import { CoursePageSection } from "./course-page-section"

// o24-courses: one page for everything an owner does with a course.
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `course`,
// `course-menu`; Ivan 14.10 ~23:45 «это тоже кстати лучше спрятать, чтобы без
// надобности не торчали поля»): the card only reads (panel-ds E2, rule 1).
// The course's name, status and «…» head the first section, then its lessons,
// then the stream, then the three lists of the course page at the bottom (the
// lead's G4 decision). Every field moved into a drawer on its own address:
// «Курс» (`edit`), «Поток» (`stream/edit`), a lesson (`lessons/…`), an entry
// of the course page (`page/:list/…`). No «Сохранить» and no «Удалить» on the
// card: «Удалить курс» is the last item of the first section's «…».

const CourseCard = ({ course, lessons }: { course: TenantCourse; lessons: TenantLesson[] }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { getFullDate } = useDate()
  const remove = useCourseDelete(course, lessons.length)

  // The course's real, clickable storefront address (t-2026-09-25-17): the
  // shop's own host, the same `OpenShop` (`layout/shell/shell.tsx`) already
  // reads, plus the product page the course sells on.
  const { primary_host: primaryHost } = useDomains()
  const { locale_settings: localeSettings } = useTenantLocaleSettings()
  const { product, isError: isProductError } = useProduct(course.product_id)
  const storefrontUrl = buildCourseStorefrontUrl(
    primaryHost,
    localeSettings?.default_locale,
    product?.handle
  )

  const general: SettingsSection = {
    id: "general",
    title: course.title,
    status: { color: STATUS_BADGE_COLOR[course.status], label: t(STATUS_LABEL_KEY[course.status]) },
    actions: [
      {
        actions: [
          { icon: <PencilSquare />, label: t("actions.change"), to: "edit" },
          {
            icon: <ArrowUpRightOnBox />,
            label: t("courses.card.openStorefront"),
            disabled: !storefrontUrl,
            onClick: () => {
              if (storefrontUrl) {
                window.open(storefrontUrl, "_blank", "noopener,noreferrer")
              }
            },
          },
        ],
      },
      {
        actions: [
          {
            icon: <Trash />,
            label: t("courses.card.delete"),
            destructive: true,
            onClick: async () => {
              if (await remove()) {
                navigate("/courses", { replace: true })
              }
            },
          },
        ],
      },
    ],
    rows: [
      {
        id: "product",
        label: t("courses.card.product"),
        value: product ? (
          <Link
            to={`/products/${product.id}`}
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small"
          >
            {product.title}
          </Link>
        ) : isProductError ? (
          t("courses.productGone")
        ) : null,
      },
      {
        id: "storefront",
        label: t("courses.card.storefront"),
        value: storefrontUrl ? (
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="course-storefront-link"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small font-mono break-all"
          >
            {storefrontUrl}
          </a>
        ) : product?.handle ? (
          `/${localeSettings?.default_locale ?? "ru"}/products/${product.handle}`
        ) : null,
        mono: true,
        hint: t("courses.card.storefrontHint"),
      },
      { id: "description", label: t("courses.card.description"), value: course.description },
    ],
  }

  const stream: SettingsSection = {
    id: "stream",
    title: t("courses.stream.title"),
    description: t("courses.stream.description"),
    editTo: "stream/edit",
    rows: [
      {
        id: "channel",
        label: t("courses.stream.channel"),
        value: course.telegram_channel_url,
        mono: true,
      },
      { id: "chat", label: t("courses.stream.chat"), value: course.telegram_chat_url, mono: true },
      {
        id: "start",
        label: t("courses.stream.start"),
        value: course.start_date ? getFullDate({ date: course.start_date }) : null,
      },
      {
        id: "access",
        label: t("courses.stream.access"),
        value: course.access_days
          ? t("courses.stream.accessValue", { count: course.access_days })
          : t("courses.stream.noLimit"),
      },
    ],
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={course} hasOutlet>
      {/* The first section's title is the screen's own (E11): h1 there only. */}
      <SettingsDetailSection section={general} level="h1" />
      <CourseLessonsSection courseId={course.id} lessons={lessons} />
      <SettingsDetailSection section={stream} />
      <CoursePageSection product={product} productMissing={isProductError} />
    </SingleColumnPage>
  )
}

export const CourseDetail = () => {
  const { id = "" } = useParams()
  const { course, lessons, isPending, isError, error } = useTenantCourse(id)

  if (isError) {
    throw error
  }

  if (isPending || !course) {
    return <SingleColumnPageSkeleton sections={4} />
  }

  return <CourseCard course={course} lessons={lessons ?? []} />
}
