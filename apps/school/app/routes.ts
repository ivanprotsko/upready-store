import { index, route, type RouteConfig } from "@react-router/dev/routes"

// The school's host serves the landing at `/` from another service (part A);
// this app answers only the paths the proxy sends it, the ones below and
// `/assets`.
export default [
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth-callback.ts"),
  route("logout", "routes/logout.ts"),
  route("healthz", "routes/healthz.ts"),
  route("app", "routes/app-layout.tsx", [
    index("routes/app-courses.tsx"),
    route(":slug", "routes/app-course.tsx"),
    route(":slug/:lessonId", "routes/app-lesson.tsx"),
  ]),
] satisfies RouteConfig
