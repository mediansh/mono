"use client"

import { createWebVitalsComponent } from "@axiomhq/react"
import { clientLogger } from "@/lib/client-logger"

const WebVitals = createWebVitalsComponent(clientLogger)

export { WebVitals }
