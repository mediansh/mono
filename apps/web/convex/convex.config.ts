import { defineApp } from "convex/server"
import workpool from "@convex-dev/workpool/convex.config.js"

const app: ReturnType<typeof defineApp> = defineApp()

app.use(workpool, { name: "discordFeedbackWorkpool" })

export default app
