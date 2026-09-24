import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// o24-courses: the panel's own screen, no Admin counterpart, against
// `/tenants/courses/*` (docs at apps/backend/src/api/tenants/courses). A course
// is one tenant product turned into a locked lesson list; `GET .../:id` already
// returns the course's lessons with their full body, so the editor never needs
// a per-lesson fetch of its own.

export type CourseStatus = "draft" | "published"

export type TenantCourse = {
  id: string
  product_id: string
  title: string
  slug: string
  description: string | null
  status: CourseStatus
  created_at: string
  updated_at: string
}

export type TenantLesson = {
  id: string
  course_id: string
  title: string
  order: number
  body: string
  video_url: string | null
}

export type TenantCourseListResponse = { courses: TenantCourse[]; count: number }
export type TenantCourseResponse = { course: TenantCourse }
export type TenantCourseDetailResponse = { course: TenantCourse; lessons: TenantLesson[] }
export type TenantLessonListResponse = { lessons: TenantLesson[] }
export type TenantLessonResponse = { lesson: TenantLesson }
export type TenantCourseDeleteResponse = { id: string; object: "course"; deleted: boolean }
export type TenantLessonDeleteResponse = { id: string; object: "lesson"; deleted: boolean }

export type CreateTenantCourseBody = {
  product_id: string
  title: string
  slug?: string
  description?: string | null
  status?: CourseStatus
}

export type UpdateTenantCourseBody = {
  title?: string
  slug?: string
  description?: string | null
  status?: CourseStatus
}

export type CreateTenantLessonBody = {
  title: string
  body?: string
  video_url?: string | null
  order?: number
}

export type UpdateTenantLessonBody = {
  title?: string
  body?: string
  video_url?: string | null
  order?: number
}

const COURSES_QUERY_KEY = "tenant-courses" as const
export const coursesQueryKeys = queryKeysFactory(COURSES_QUERY_KEY)

export const useTenantCourses = (
  options?: Omit<
    UseQueryOptions<TenantCourseListResponse, FetchError, TenantCourseListResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantCourseListResponse>("/tenants/courses"),
    queryKey: coursesQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useTenantCourse = (
  id: string,
  options?: Omit<
    UseQueryOptions<TenantCourseDetailResponse, FetchError, TenantCourseDetailResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantCourseDetailResponse>(`/tenants/courses/${id}`),
    queryKey: coursesQueryKeys.detail(id),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateTenantCourse = (
  options?: UseMutationOptions<TenantCourseResponse, FetchError, CreateTenantCourseBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantCourseResponse>("/tenants/courses", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateTenantCourse = (
  id: string,
  options?: UseMutationOptions<TenantCourseResponse, FetchError, UpdateTenantCourseBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantCourseResponse>(`/tenants/courses/${id}`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.detail(id) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteTenantCourse = (
  id: string,
  options?: UseMutationOptions<TenantCourseDeleteResponse, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<TenantCourseDeleteResponse>(`/tenants/courses/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useCreateTenantLesson = (
  courseId: string,
  options?: UseMutationOptions<TenantLessonResponse, FetchError, CreateTenantLessonBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantLessonResponse>(`/tenants/courses/${courseId}/lessons`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.detail(courseId) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateTenantLesson = (
  courseId: string,
  lessonId: string,
  options?: UseMutationOptions<TenantLessonResponse, FetchError, UpdateTenantLessonBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantLessonResponse>(
        `/tenants/courses/${courseId}/lessons/${lessonId}`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.detail(courseId) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** Takes the lesson id as its mutate variable, so one hook serves every row of the list. */
export const useDeleteTenantLesson = (
  courseId: string,
  options?: UseMutationOptions<TenantLessonDeleteResponse, FetchError, string>
) => {
  return useMutation({
    mutationFn: (lessonId) =>
      sdk.client.fetch<TenantLessonDeleteResponse>(
        `/tenants/courses/${courseId}/lessons/${lessonId}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.detail(courseId) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/** The lesson panel's drag-to-reorder list, top to bottom (`ids`, not deltas). */
export const useReorderTenantLessons = (
  courseId: string,
  options?: UseMutationOptions<TenantLessonListResponse, FetchError, { ids: string[] }>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantLessonListResponse>(
        `/tenants/courses/${courseId}/lessons/reorder`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.detail(courseId) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
