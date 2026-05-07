import { motion } from "motion/react";
import type { DayState } from "../lib/upptime";
import { cn } from "../lib/cn";

interface UptimeBarProps {
  history: DayState[];
  delay?: number;
}

const STATE_CLASS: Record<DayState, string> = {
  up: "bg-foreground",
  partial: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-border",
};

const STATE_LABEL: Record<DayState, string> = {
  up: "Operational",
  partial: "Partial outage",
  down: "Major outage",
  unknown: "No data",
};

export function UptimeBar({ history, delay = 0 }: UptimeBarProps) {
  return (
    <div className="flex h-7 w-full items-stretch gap-[2px]">
      {history.map((state, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scaleY: 0.4 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{
            duration: 0.25,
            ease: "easeOut",
            delay: delay + i * 0.006,
          }}
          title={`${dayLabel(history.length - 1 - i)} — ${STATE_LABEL[state]}`}
          className={cn(
            "flex-1 rounded-[2px] origin-bottom transition-colors",
            STATE_CLASS[state]
          )}
        />
      ))}
    </div>
  );
}

function dayLabel(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}
