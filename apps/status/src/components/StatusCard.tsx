import { motion } from "motion/react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import { UptimeBar } from "./UptimeBar";
import {
  buildDailyHistory,
  type ServiceConfig,
  type UpptimeService,
} from "../lib/upptime";
import { cn } from "../lib/cn";

interface StatusCardProps {
  config: ServiceConfig;
  service: UpptimeService | undefined;
  index: number;
}

export function StatusCard({ config, service, index }: StatusCardProps) {
  const status = service?.status ?? "unknown";
  const uptimeMonth = service?.uptimeMonth ?? "—";
  const history = buildDailyHistory(service);

  const Icon =
    status === "up"
      ? CheckCircleIcon
      : status === "down"
        ? XCircleIcon
        : status === "degraded"
          ? WarningCircleIcon
          : QuestionIcon;

  const iconClass = cn(
    status === "up" && "text-foreground",
    status === "down" && "text-destructive",
    status === "degraded" && "text-warning",
    status === "unknown" && "text-muted-foreground"
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: "easeOut",
        delay: 0.1 + index * 0.06,
      }}
      className="rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5"
    >
      <header className="flex items-center justify-between gap-3">
        <Icon weight="fill" size={32} className={iconClass} />
        <div className="flex flex-col items-end text-right">
          <h2 className="text-base font-semibold tracking-tight">
            {config.label}
          </h2>
          {config.url && (
            <p className="text-xs text-muted-foreground">{config.url}</p>
          )}
        </div>
      </header>

      <div className="mt-4">
        <UptimeBar history={history} delay={0.15 + index * 0.06} />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>90 days</span>
          <span className="font-medium text-foreground">
            {uptimeMonth} uptime
          </span>
        </div>
      </div>
    </motion.article>
  );
}
