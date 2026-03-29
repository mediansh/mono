// instrumentation.ts (project root)
import { registerOTel } from "@vercel/otel";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

export function register() {
  registerOTel({
    serviceName: "my-next-app",
    attributes: { environment: "production" },
    traceExporter: new OTLPTraceExporter({
      url: "https://ingest.maple.dev/v1/traces",
    }),
    logRecordProcessors: [
      new SimpleLogRecordProcessor(
        new OTLPLogExporter({
          url: "https://ingest.maple.dev/v1/logs",
          headers: { Authorization: "Bearer maple_pk_LfWV1IxqaCfOl9TTmsDDECMf276dT9yz" },
        })
      ),
    ],
  });
}
