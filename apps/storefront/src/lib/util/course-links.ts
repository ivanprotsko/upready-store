/**
 * Where a bought course lives (ask-20261005-053807-eaae, Ivan 05.10: «Курс
 * всегда в личном кабинете»): its contents at `/account/courses/<slug>`, every
 * lesson under them. Locale-less, the way `Link` from `@i18n/navigation`
 * takes an href; a `redirect()` puts the locale in front itself.
 */
export const courseContentsHref = (slug: string) =>
  `/account/courses/${encodeURIComponent(slug)}`

export const courseLessonHref = (slug: string, lessonId: string) =>
  `${courseContentsHref(slug)}/lessons/${encodeURIComponent(lessonId)}`

/** The test after a lesson (ask-20261005-061005-2e78), one step past the lesson itself. */
export const courseLessonTestHref = (slug: string, lessonId: string) =>
  `${courseLessonHref(slug, lessonId)}/test`

/**
 * «Продолжить» on a «Мои курсы» card: the lesson the backend picked
 * (`continue_lesson_id`, the first lesson not viewed yet or, with every lesson
 * viewed, the one viewed last), else the course's contents while no lesson is
 * viewed.
 */
export const continueCourseHref = (course: {
  slug: string
  continue_lesson_id: string | null
}) =>
  course.continue_lesson_id
    ? courseLessonHref(course.slug, course.continue_lesson_id)
    : courseContentsHref(course.slug)
