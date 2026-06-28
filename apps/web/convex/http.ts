import { httpRouter } from "convex/server"
import { submitFeedbackHttp, submitFeedbackHttpOptions } from "./feedbackApi"
import { githubInstallCallback, githubWebhook } from "./github"
import { linearWebhook } from "./linear"
import { slackOAuthCallback, slackEventsWebhook, slackInteractivity } from "./slack"
import { statusEndpoint } from "./status"
import { listTasksHttp, listTasksHttpOptions } from "./tasksApi"
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

http.route({
  path: "/api/feedback",
  method: "POST",
  handler: submitFeedbackHttp,
})

http.route({
  path: "/api/feedback",
  method: "OPTIONS",
  handler: submitFeedbackHttpOptions,
})

http.route({
  path: "/api/tasks",
  method: "GET",
  handler: listTasksHttp,
})

http.route({
  path: "/api/tasks",
  method: "OPTIONS",
  handler: listTasksHttpOptions,
})

export default http
