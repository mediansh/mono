import { httpRouter } from "convex/server"
import { githubInstallCallback, githubWebhook } from "./github"
import { linearWebhook } from "./linear"
import { slackOAuthCallback, slackEventsWebhook, slackInteractivity } from "./slack"
import { statusEndpoint } from "./status"
import { xOAuthCallback, xWebhook } from "./x"

const http = httpRouter()

http.route({
  path: "/status",
  method: "GET",
  handler: statusEndpoint,
})

http.route({
  path: "/status",
  method: "OPTIONS",
  handler: statusEndpoint,
})

http.route({
  path: "/linear/webhook",
  method: "POST",
  handler: linearWebhook,
})

http.route({
  path: "/github/callback",
  method: "GET",
  handler: githubInstallCallback,
})

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: githubWebhook,
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

http.route({
  path: "/slack/oauth/callback",
  method: "GET",
  handler: slackOAuthCallback,
})

http.route({
  path: "/slack/events",
  method: "POST",
  handler: slackEventsWebhook,
})

http.route({
  path: "/slack/interactivity",
  method: "POST",
  handler: slackInteractivity,
})

export default http
