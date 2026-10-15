import { UIMatch } from "react-router-dom"

import { useTenantCourse } from "../../../hooks/api/courses"

// t-2026-10-14-01 (G4): the crumb of the card is the course's name, read from
// the same query the card reads.
export const CourseDetailBreadcrumb = (props: UIMatch) => {
  const { id } = props.params || {}
  const { course } = useTenantCourse(id ?? "", { enabled: Boolean(id) })

  if (!course) {
    return null
  }

  return <span>{course.title}</span>
}
