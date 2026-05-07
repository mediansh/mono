import { motion } from "motion/react";
import {
  CheckSquareIcon,
  WarningIcon,
  WarningOctagonIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";
import type { OverallState } from "../lib/upptime";

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

export function StatusBanner({ state, loading }: StatusBannerProps) {
  const Icon = loading
    ? CircleNotchIcon
    : state === "operational"
      ? CheckSquareIcon
      : state === "outage"
        ? WarningOctagonIcon
        : WarningIcon;

  const label = loading ? "Checking status…" : STATE_COPY[state];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex items-center justify-between rounded-[var(--radius)] bg-foreground px-5 py-4 text-background shadow-[0_1px_0_rgba(0,0,0,0.04)]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-background/20">
        <Icon
          weight="regular"
          size={22}
          className={loading ? "animate-spin" : ""}
        />
      </div>
      <span className="text-base font-medium tracking-tight sm:text-lg">
        {label}
      </span>
    </motion.div>
  );
}
