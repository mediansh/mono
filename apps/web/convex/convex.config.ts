import { defineApp } from "convex/server"
import workpool from "@convex-dev/workpool/convex.config.js"

const app: ReturnType<typeof defineApp> = defineApp()

app.use(workpool, { name: "discordFeedbackWorkpool" })
app.use(workpool, { name: "xFeedbackWorkpool" })
app.use(workpool, { name: "slackFeedbackWorkpool" })

export default app
