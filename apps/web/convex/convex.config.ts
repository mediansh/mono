import { defineApp } from "convex/server"
import workpool from "@convex-dev/workpool/convex.config.js"

const app: ReturnType<typeof defineApp> = defineApp()

app.use(workpool, { name: "discordFeedbackWorkpool" })
app.use(workpool, { name: "xFeedbackWorkpool" })

export default app
