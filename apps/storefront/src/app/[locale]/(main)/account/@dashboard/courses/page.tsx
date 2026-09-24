import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"
import { listMyCourses } from "@lib/data/courses"
import AccountPageHeader from "@modules/account/components/account-page-header"
import MyCoursesList from "@modules/account/components/my-courses-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.courses")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
  }
}

export default async function Courses() {
  const courses = await listMyCourses()
  const t = await getTranslations("CoursesPage")

  return (
    <div className="w-full" data-testid="courses-page-wrapper">
      <AccountPageHeader
        heading={t("heading")}
        description={t("description")}
      />
      {courses.length > 0 ? (
        <MyCoursesList courses={courses} />
      ) : (
        <p className="text-ui-fg-subtle" data-testid="my-courses-empty">
          {t("empty")}
        </p>
      )}
    </div>
  )
}
