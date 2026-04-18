import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sso-callback", "routes/sso-callback.tsx"),
  layout("routes/admin-layout.tsx", [
    index("routes/_index.tsx"),
    route("blog", "routes/blog._index.tsx"),
    route("blog/new", "routes/blog.new.tsx"),
    route("blog/:id", "routes/blog.$id.tsx"),
    route("changelog", "routes/changelog._index.tsx"),
    route("changelog/new", "routes/changelog.new.tsx"),
    route("changelog/:id", "routes/changelog.$id.tsx"),
    route("early-access", "routes/early-access.tsx"),
    route("users", "routes/users._index.tsx"),
    route("users/:userId", "routes/users.$userId.tsx"),
  ]),
] satisfies RouteConfig
