import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { DayState } from "../lib/upptime";
import type { Incident } from "../lib/incidents";
import { formatDuration } from "../lib/incidents";
import { cn } from "../lib/cn";

interface UptimeBarProps {
  history: DayState[];
  dayKeys: string[];
  incidentsByDay?: Record<string, Incident[]>;
  delay?: number;
}

const STATE_CLASS: Record<DayState, string> = {
  up: "bg-success",
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

export function UptimeBar({
  history,
  dayKeys,
  incidentsByDay = {},
  delay = 0,
}: UptimeBarProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className="relative flex h-7 w-full items-stretch gap-[2px]">
      {history.map((state, i) => {
        const day = dayKeys[i];
        const incidents = incidentsByDay[day] ?? [];
        return (
          <div
            key={i}
            className="relative flex-1"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() =>
              setActiveIndex((prev) => (prev === i ? null : prev))
            }
            onFocus={() => setActiveIndex(i)}
            onBlur={() =>
              setActiveIndex((prev) => (prev === i ? null : prev))
            }
          >
            <motion.button
              type="button"
              tabIndex={0}
              aria-label={`${friendlyDate(day)} — ${STATE_LABEL[state]}`}
              initial={{ opacity: 0, scaleY: 0.4 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{
                duration: 0.25,
                ease: "easeOut",
                delay: delay + i * 0.006,
              }}
              className={cn(
                "block h-full w-full origin-bottom rounded-[2px] cursor-pointer transition-colors hover:opacity-80",
                STATE_CLASS[state]
              )}
            />
            <AnimatePresence>
              {activeIndex === i && (
                <DayTooltip
                  day={day}
                  state={state}
                  incidents={incidents}
                  alignEnd={i > history.length - 8}
                />
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

interface DayTooltipProps {
  day: string;
  state: DayState;
  incidents: Incident[];
  alignEnd: boolean;
}

function DayTooltip({ day, state, incidents, alignEnd }: DayTooltipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute bottom-[calc(100%+8px)] z-20 w-60 rounded-md border border-border bg-card p-3 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        alignEnd ? "right-0" : "left-1/2 -translate-x-1/2"
      )}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-tight text-foreground">
          {friendlyDate(day)}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-wider",
            state === "up" && "text-muted-foreground",
            state === "partial" && "text-warning",
            state === "down" && "text-destructive",
            state === "unknown" && "text-muted-foreground"
          )}
        >
          {STATE_LABEL[state]}
        </span>
      </div>
      {incidents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {state === "up" || state === "unknown"
            ? "No incidents reported."
            : "Incident details unavailable."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {incidents.map((incident) => (
            <li key={incident.number} className="text-xs leading-snug">
              <span className="block text-foreground">{incident.title}</span>
              <span className="text-[10px] text-muted-foreground">
                {incident.status === "ongoing"
                  ? "Ongoing"
                  : `Resolved · ${formatDuration(incident.durationMinutes)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function friendlyDate(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
