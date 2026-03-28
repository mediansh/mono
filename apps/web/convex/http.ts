import { httpRouter } from "convex/server"
import { linearWebhook } from "./linear"
import { xOAuthCallback, xWebhook } from "./x"

const http = httpRouter()

http.route({
  path: "/linear/webhook",
  method: "POST",
  handler: linearWebhook,
})

http.route({
  path: "/x/webhook",
  method: "GET",
  handler: xWebhook,
})

http.route({
  path: "/x/webhook",
  method: "POST",
  handler: xWebhook,
})

http.route({
  path: "/x/oauth/callback",
  method: "GET",
  handler: xOAuthCallback,
})

export default http
