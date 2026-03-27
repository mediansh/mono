import { httpRouter } from "convex/server"
import { linearWebhook } from "./linear"

const http = httpRouter()

http.route({
  path: "/linear/webhook",
  method: "POST",
  handler: linearWebhook,
})

export default http
