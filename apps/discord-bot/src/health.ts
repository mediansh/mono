import { createServer, type ServerResponse } from "node:http"

type HealthDetails = {
  ok?: boolean
  status?: string
  [key: string]: unknown
}

export type HealthServer = {
  port: number
  close: () => Promise<void>
}

function getHealthPort() {
  const rawPort = process.env.PORT ?? process.env.HEALTH_PORT ?? "8080"
  const port = Number.parseInt(rawPort, 10)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid health port: ${rawPort}`)
  }

  return port
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  method?: string
) {
  const body = JSON.stringify(payload)

  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body).toString(),
    "content-type": "application/json; charset=utf-8",
  })

  response.end(method === "HEAD" ? undefined : body)
}

export function startHealthServer(options: {
  getStatus?: () => HealthDetails
} = {}): Promise<HealthServer> {
  const port = getHealthPort()

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost")

    if (url.pathname !== "/health") {
      writeJson(
        response,
        404,
        {
          ok: false,
          error: "Not found",
        },
        request.method
      )
      return
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD")
      writeJson(
        response,
        405,
        {
          ok: false,
          error: "Method not allowed",
        },
        request.method
      )
      return
    }

    const details = options.getStatus?.() ?? {}
    const payload = {
      ok: true,
      status: "ok",
      ...details,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    }

    writeJson(response, payload.ok === false ? 503 : 200, payload, request.method)
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, () => {
      server.off("error", reject)
      resolve({
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            if (!server.listening) {
              closeResolve()
              return
            }

            server.close((error) => {
              if (error) {
                closeReject(error)
                return
              }

              closeResolve()
            })
          }),
      })
    })
  })
}
