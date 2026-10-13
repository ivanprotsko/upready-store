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
import { courseScheduleBody, dateInputValue, lessonGroups } from "../lesson-form/lesson-form-values"
import { CoursePageSection } from "./course-page-section"

const WEB_URL = /^https?:\/\/\S+$/i

// o24-courses: one page for everything an owner does with a course, the same
// shape `product-attributes/attribute-edit` uses (view and edit share the page,
// no separate `/edit` route) — a course has four owner-facing fields, same
// order of magnitude as an attribute. Lessons get their own drawer per lesson
// (`lessons/new`, `lessons/:lessonId`) because a lesson's text runs long.

/** What a lesson row says about its content: its videos, files and the day it opens. */
const LessonMarks = ({ lesson }: { lesson: TenantLesson }) => {
  const videos = lesson.videos?.length ?? (lesson.video_url ? 1 : 0)
  const files = lesson.attachments?.length ?? 0

  return (
    <span className="flex items-center gap-x-2 text-ui-fg-muted">
      {videos > 0 ? (
        <span className="flex items-center gap-x-0.5">
          <MediaPlay />
          {videos > 1 ? <Text size="xsmall">{videos}</Text> : null}
        </span>
      ) : null}
      {files > 0 ? <Text size="xsmall">файлов: {files}</Text> : null}
      {lesson.available_from_day ? <Text size="xsmall">день {lesson.available_from_day}</Text> : null}
    </span>
  )
}

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
  // t-2026-10-13-29 stage 2: the stream's Telegram, its start and the access length.
  const [channelUrl, setChannelUrl] = useState("")
  const [chatUrl, setChatUrl] = useState("")
  const [startDate, setStartDate] = useState("")
  const [accessDays, setAccessDays] = useState("")
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
    setChannelUrl(course.telegram_channel_url ?? "")
    setChatUrl(course.telegram_chat_url ?? "")
    setStartDate(dateInputValue(course.start_date))
    setAccessDays(course.access_days ? String(course.access_days) : "")
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
    const channel = channelUrl.trim()
    const chat = chatUrl.trim()
    if ((channel && !WEB_URL.test(channel)) || (chat && !WEB_URL.test(chat))) {
      toast.error("Ссылки на Telegram должны начинаться с https://")
      return
    }
    const schedule = courseScheduleBody(startDate, accessDays)
    if (!schedule.ok) {
      toast.error(schedule.error)
      return
    }

    await save(
      {
        title: trimmedTitle,
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        status: published ? "published" : "draft",
        telegram_channel_url: channel || null,
        telegram_chat_url: chat || null,
        start_date: schedule.start_date,
        access_days: schedule.access_days,
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

  /** A drag inside one section: that section's new order, the others as they are. */
  const handleGroupReorder = (groupIndex: number, items: TenantLesson[]) => {
    const groups = lessonGroups(orderedLessons)
    groups[groupIndex] = { title: groups[groupIndex]?.title ?? null, lessons: items }
    return handleReorder(groups.flatMap((group) => group.lessons))
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
          <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Название
              </Text>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Адрес
              </Text>
              <Input value={slug} onChange={(event) => setSlug(event.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="flex max-w-3xl flex-col gap-y-1">
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
          <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2" data-testid="course-stream">
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Telegram-канал курса
              </Text>
              <Input
                value={channelUrl}
                onChange={(event) => setChannelUrl(event.target.value)}
                placeholder="https://t.me/…"
                data-testid="course-telegram-channel"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Чат потока
              </Text>
              <Input
                value={chatUrl}
                onChange={(event) => setChatUrl(event.target.value)}
                placeholder="https://t.me/…"
                data-testid="course-telegram-chat"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Старт потока
              </Text>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                data-testid="course-start-date"
              />
              <Text size="xsmall" className="text-ui-fg-muted">
                Уроки с днём открытия считают дни от старта или от покупки, что позже.
              </Text>
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Доступ, дней
              </Text>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={accessDays}
                onChange={(event) => setAccessDays(event.target.value)}
                placeholder="Без срока"
                data-testid="course-access-days"
              />
              <Text size="xsmall" className="text-ui-fg-muted">
                Покупатель видит «Доступ до …». Пусто — без срока.
              </Text>
            </div>
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
                строку за ручку слева, чтобы изменить порядок внутри раздела;
                раздел урока меняется в его форме.
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
            <div className="flex flex-col gap-y-4" data-testid="lesson-groups">
              {lessonGroups(orderedLessons).map((group, groupIndex) => (
                <div key={`${group.title ?? ""}-${groupIndex}`} className="flex flex-col gap-y-2" data-testid="lesson-group">
                  {group.title ? (
                    <Text size="small" weight="plus" className="text-ui-fg-subtle">
                      {group.title}
                    </Text>
                  ) : null}
                  <div className="overflow-hidden rounded-xl border">
                    <SortableList
                      items={group.lessons}
                      onChange={(items) => handleGroupReorder(groupIndex, items)}
                      renderItem={(lesson, index) => (
                        <SortableList.Item
                          id={lesson.id}
                          className={clx("bg-ui-bg-base border-b", {
                            "border-b-0": index === group.lessons.length - 1,
                          })}
                        >
                          <div
                            className="flex w-full items-center gap-3 px-4 py-2.5"
                            data-testid="lesson-row"
                          >
                            <SortableList.DragHandle />
                            <Link
                              to={`lessons/${lesson.id}`}
                              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                            >
                              <Text size="small" weight="plus">
                                {orderedLessons.indexOf(lesson) + 1}. {lesson.title}
                              </Text>
                              <LessonMarks lesson={lesson} />
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
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>
      <CoursePageSection product={product} productMissing={isProductError} />
    </SingleColumnPage>
  )
}
