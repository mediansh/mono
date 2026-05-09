import { motion } from "motion/react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";
import type { OverallState } from "../lib/upptime";
import { cn } from "../lib/cn";

interface StatusBannerProps {
  state: OverallState;
  loading?: boolean;
}

const STATE_COPY: Record<OverallState, string> = {
  operational: "Fully operational",
  degraded: "Partial service degradation",
  outage: "Active outage",
  unknown: "Status unavailable",
};

const STATE_BG: Record<OverallState, string> = {
  operational: "bg-success text-background",
  degraded: "bg-warning text-background",
  outage: "bg-destructive text-foreground",
  unknown: "bg-muted text-foreground",
};

export function StatusBanner({ state, loading }: StatusBannerProps) {
  const Icon = loading
    ? CircleNotchIcon
    : state === "operational"
      ? CheckCircleIcon
      : state === "outage"
        ? XCircleIcon
        : state === "degraded"
          ? WarningCircleIcon
          : CircleNotchIcon;

  const label = loading ? "Checking status…" : STATE_COPY[state];
  const tone = loading ? "bg-muted text-foreground" : STATE_BG[state];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex items-center justify-between rounded-[var(--radius)] px-5 py-4 transition-colors",
        tone
      )}
    >
      <Icon
        weight="fill"
        size={32}
        className={loading ? "animate-spin" : ""}
      />
      <span className="text-base font-medium tracking-tight sm:text-lg">
        {label}
      </span>
    </motion.div>
  );
}
