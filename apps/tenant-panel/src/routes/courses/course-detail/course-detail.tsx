import { useEffect, useRef, useState } from "react"
import { MediaPlay, Plus, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, Input, Prompt, Switch, Text, Textarea, clx, toast } from "@medusajs/ui"
import { Link, useNavigate, useParams } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SortableList } from "../../../components/common/sortable-list"
import {
  TenantLesson,
  useDeleteTenantCourse,
  useDeleteTenantLesson,
  useReorderTenantLessons,
  useTenantCourse,
  useUpdateTenantCourse,
} from "../../../hooks/api/courses"
import { useDomains } from "../../../hooks/api/domains"
import { useTenantLocaleSettings } from "../../../hooks/api/locale-settings"
import { useProduct } from "../../../hooks/api/products"
import { buildCourseStorefrontUrl } from "../course-labels"
import { CoursePageSection } from "./course-page-section"

// o24-courses: one page for everything an owner does with a course, the same
// shape `product-attributes/attribute-edit` uses (view and edit share the page,
// no separate `/edit` route) — a course has four owner-facing fields, same
// order of magnitude as an attribute. Lessons get their own drawer per lesson
// (`lessons/new`, `lessons/:lessonId`) because a lesson's text runs long.

export const CourseDetail = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const { course, lessons, isPending, isError, error } = useTenantCourse(id)

  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantCourse(id)
  const { mutateAsync: remove, isPending: isDeleting } = useDeleteTenantCourse(id)
  const { mutateAsync: reorder } = useReorderTenantLessons(id)
  const { mutateAsync: deleteLesson, isPending: isDeletingLesson } = useDeleteTenantLesson(id)

  // The course's real, clickable storefront address (t-2026-09-25-17): the
  // shop's own host, the same `OpenShop` (`layout/shell/shell.tsx`) already
  // reads, plus the product page the course sells on. `useProduct` is only
  // enabled once the course itself has loaded, so it never fires with an
  // empty `product_id`.
  const { primary_host: primaryHost } = useDomains()
  const { locale_settings: localeSettings } = useTenantLocaleSettings()
  const { product, isError: isProductError } = useProduct(course?.product_id ?? "", undefined, {
    enabled: Boolean(course?.product_id),
  })
  const storefrontUrl = buildCourseStorefrontUrl(
    primaryHost,
    localeSettings?.default_locale,
    product?.handle
  )

  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [published, setPublished] = useState(false)
  const [orderedLessons, setOrderedLessons] = useState<TenantLesson[]>([])

  // The fetch resolves whenever the network decides. Filling the form from a
  // late answer would wipe what the owner has already typed, so the answer
  // seeds the form ONCE (rule 19h) and every later refetch leaves it alone.
  const seeded = useRef(false)

  useEffect(() => {
    if (!course || seeded.current) {
      return
    }
    seeded.current = true
    setTitle(course.title)
    setSlug(course.slug)
    setDescription(course.description ?? "")
    setPublished(course.status === "published")
  }, [course])

  useEffect(() => {
    setOrderedLessons(lessons ?? [])
  }, [lessons])

  if (isError) {
    throw error
  }

  if (isPending || !course || !seeded.current) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  const handleSave = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      toast.error("Укажите название курса.")
      return
    }

    await save(
      {
        title: trimmedTitle,
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        status: published ? "published" : "draft",
      },
      {
        onSuccess: (updated) => {
          setSlug(updated.course.slug)
          toast.success("Сохранено")
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  const handleDelete = async () => {
    await remove(undefined, {
      onSuccess: () => {
        toast.success("Курс удалён")
        navigate("/courses")
      },
      onError: (deleteError) => toast.error(deleteError.message),
    })
  }

  const handleReorder = async (items: TenantLesson[]) => {
    const previous = orderedLessons
    setOrderedLessons(items)
    await reorder(
      { ids: items.map((item) => item.id) },
      { onError: (reorderError) => {
          toast.error(reorderError.message)
          setOrderedLessons(previous)
        },
      }
    )
  }

  const handleDeleteLesson = async (lesson: TenantLesson) => {
    await deleteLesson(lesson.id, {
      onSuccess: () => toast.success("Урок удалён"),
      onError: (deleteError) => toast.error(deleteError.message),
    })
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={course}>
      <Container className="divide-y p-0">
        {/* t-2026-10-13-30: the storefront address is one unbreakable mono
            word; with no `min-w-0` it held its full width and pushed «Удалить»
            and «Сохранить» off a 390 px screen. It now ends in an ellipsis and
            the buttons wrap under the title on a phone. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 max-w-full flex-col gap-y-1">
            <Heading level="h2">{course.title}</Heading>
            <Text
              size="small"
              className="text-ui-fg-subtle font-mono truncate"
              title={storefrontUrl ?? undefined}
            >
              {storefrontUrl ? (
                <a
                  href={storefrontUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="course-storefront-link"
                  className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
                >
                  {storefrontUrl}
                </a>
              ) : product?.handle ? (
                `/${localeSettings?.default_locale ?? "ru"}/products/${product.handle}`
              ) : (
                "…"
              )}
            </Text>
          </div>
          <div className="flex shrink-0 items-center gap-x-2">
            <Prompt>
              <Prompt.Trigger asChild>
                <Button size="small" variant="secondary" isLoading={isDeleting}>
                  <Trash /> Удалить
                </Button>
              </Prompt.Trigger>
              <Prompt.Content>
                <Prompt.Header>
                  <Prompt.Title>Удалить курс?</Prompt.Title>
                  <Prompt.Description>
                    Уроки удалятся вместе с ним. Покупатели, уже получившие доступ,
                    его не лишатся — история их покупки не удаляется. Отменить это
                    нельзя.
                  </Prompt.Description>
                </Prompt.Header>
                <Prompt.Footer>
                  <Prompt.Cancel>Отмена</Prompt.Cancel>
                  <Prompt.Action onClick={handleDelete}>Удалить</Prompt.Action>
                </Prompt.Footer>
              </Prompt.Content>
            </Prompt>
            <Button size="small" onClick={handleSave} isLoading={isSaving} data-testid="course-save">
              Сохранить
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-y-4 px-6 py-4">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
            <div className="flex w-full max-w-[320px] flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Название
              </Text>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex w-full max-w-[220px] flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Адрес
              </Text>
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="font-mono w-full"
              />
            </div>
          </div>
          <div className="flex flex-col gap-y-1 max-w-[640px]">
            <Text size="small" className="text-ui-fg-subtle">
              Описание
            </Text>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Что покупатель узнает и получит на курсе"
            />
          </div>
          <label className="flex items-center gap-x-2">
            <Switch checked={published} onCheckedChange={setPublished} />
            <span className="flex flex-col">
              <Text size="small">Курс опубликован</Text>
              <Text size="small" className="text-ui-fg-subtle">
                Черновик не виден покупателям, даже если товар уже продаётся.
              </Text>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div className="flex items-start justify-between gap-x-4">
            <div className="flex flex-col gap-y-1">
              <Heading level="h3">Уроки</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Порядок урока — тот, в котором его увидит покупатель. Перетащите
                строку за ручку слева, чтобы изменить порядок.
              </Text>
            </div>
            <Link to="lessons/new">
              <Button size="small" variant="secondary" data-testid="lesson-new">
                <Plus /> Добавить урок
              </Button>
            </Link>
          </div>

          {orderedLessons.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="lesson-empty">
              Уроков пока нет. Добавьте первый — кнопка выше.
            </Text>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <SortableList
                items={orderedLessons}
                onChange={handleReorder}
                renderItem={(lesson, index) => (
                  <SortableList.Item
                    id={lesson.id}
                    className={clx("bg-ui-bg-base border-b", {
                      "border-b-0": index === orderedLessons.length - 1,
                    })}
                  >
                    <div
                      className="flex w-full items-center gap-3 px-4 py-2.5"
                      data-testid="lesson-row"
                    >
                      <SortableList.DragHandle />
                      <Link
                        to={`lessons/${lesson.id}`}
                        className="flex flex-1 items-center gap-x-2 text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                      >
                        <Text size="small" weight="plus">
                          {index + 1}. {lesson.title}
                        </Text>
                        {lesson.video_url ? (
                          <MediaPlay className="text-ui-fg-muted" />
                        ) : null}
                      </Link>
                      <Prompt>
                        <Prompt.Trigger asChild>
                          <IconButton size="small" variant="transparent" isLoading={isDeletingLesson}>
                            <Trash />
                          </IconButton>
                        </Prompt.Trigger>
                        <Prompt.Content>
                          <Prompt.Header>
                            <Prompt.Title>Удалить урок «{lesson.title}»?</Prompt.Title>
                            <Prompt.Description>
                              Прогресс покупателей, уже отметивших его просмотренным,
                              сохранится как исторический факт. Отменить это нельзя.
                            </Prompt.Description>
                          </Prompt.Header>
                          <Prompt.Footer>
                            <Prompt.Cancel>Отмена</Prompt.Cancel>
                            <Prompt.Action onClick={() => handleDeleteLesson(lesson)}>
                              Удалить
                            </Prompt.Action>
                          </Prompt.Footer>
                        </Prompt.Content>
                      </Prompt>
                    </div>
                  </SortableList.Item>
                )}
              />
            </div>
          )}
        </div>
      </Container>
      <CoursePageSection product={product} productMissing={isProductError} />
    </SingleColumnPage>
  )
}
