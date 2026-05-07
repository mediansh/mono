import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { Logo } from "./Logo";
import {
  fetchIncidents,
  formatDuration,
  type Incident,
} from "../lib/incidents";
import { SERVICES } from "../lib/upptime";
import { cn } from "../lib/cn";

type Filter = "all" | string;

const HISTORY_DAYS = 14;

const SEVERITY_LABEL: Record<Incident["severity"], string> = {
  down: "Major outage",
  degraded: "Degraded performance",
  incident: "Incident",
};

const SEVERITY_DOT: Record<Incident["severity"], string> = {
  down: "bg-destructive",
  degraded: "bg-warning",
  incident: "bg-muted-foreground",
};

const SEVERITY_BADGE: Record<Incident["severity"], string> = {
  down: "border-destructive/20 bg-destructive/10 text-destructive",
  degraded: "border-warning/20 bg-warning/10 text-warning",
  incident: "border-border bg-muted/40 text-muted-foreground",
};

export function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    fetchIncidents()
      .then((data) => {
        if (!cancelled) setIncidents(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!incidents) return [];
    if (filter === "all") return incidents;
    return incidents.filter((i) => i.serviceSlug === filter);
  }, [incidents, filter]);

  const days = useMemo(() => buildDays(filtered), [filtered]);
  const olderIncidents = useMemo(() => {
    const cutoff = startOfDay(new Date());
    cutoff.setDate(cutoff.getDate() - (HISTORY_DAYS - 1));
    return filtered.filter((i) => new Date(i.startedAt) < cutoff);
  }, [filtered]);
  const olderByMonth = useMemo(
    () => groupByMonth(olderIncidents),
    [olderIncidents]
  );

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-10 sm:py-16">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mb-10 flex items-center justify-center gap-2 text-foreground"
      >
        <Logo className="h-7 w-auto" />
        <span className="text-xl font-semibold tracking-tight">Status</span>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
        className="mb-8"
      >
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon weight="bold" size={14} />
          Back to status
        </a>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Incident history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past {HISTORY_DAYS} days of incidents across Median services.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-8 flex flex-wrap gap-1"
      >
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
        />
        {SERVICES.map((s) => (
          <FilterPill
            key={s.slug}
            active={filter === s.slug}
            onClick={() => setFilter(s.slug)}
            label={s.label}
          />
        ))}
      </motion.div>

      {error && (
        <p className="text-xs text-muted-foreground">
          Couldn't load incidents from GitHub. {error}
        </p>
      )}

      {!error && incidents === null && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-3 w-32 animate-pulse rounded bg-card" />
              <div className="h-14 animate-pulse rounded-[var(--radius)] bg-card" />
            </div>
          ))}
        </div>
      )}

      {!error && incidents !== null && (
        <div className="flex flex-col gap-7">
          {days.map((day, i) => (
            <DaySection key={day.key} day={day} index={i} />
          ))}
        </div>
      )}

      {!error && olderByMonth.length > 0 && (
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="mb-5 text-sm font-semibold tracking-tight">
            Earlier incidents
          </h2>
          <div className="flex flex-col gap-7">
            {olderByMonth.map((group, gi) => (
              <motion.section
                key={group.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: gi * 0.04 }}
              >
                <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.incidents.map((incident, i) => (
                    <IncidentDropdown
                      key={incident.number}
                      incident={incident}
                      index={i}
                    />
                  ))}
                </ul>
              </motion.section>
            ))}
          </div>
        </div>
      )}

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="mt-12 pt-6 text-center text-xs text-muted-foreground"
      >
        © Median {new Date().getFullYear()}
      </motion.footer>
    </main>
  );
}

interface Day {
  key: string;
  date: Date;
  incidents: Incident[];
}

function DaySection({ day, index }: { day: Day; index: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {formatDayLabel(day.date)}
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {day.date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      {day.incidents.length === 0 ? (
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <CheckCircleIcon
            weight="fill"
            size={14}
            className="text-foreground/70"
          />
          No incidents reported.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {day.incidents.map((incident, i) => (
            <IncidentDropdown
              key={incident.number}
              incident={incident}
              index={i}
            />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function IncidentDropdown({
  incident,
  index,
}: {
  incident: Incident;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const isOngoing = incident.status === "ongoing";

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="overflow-hidden rounded-[var(--radius)] border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card/60"
        aria-expanded={open}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            SEVERITY_DOT[incident.severity],
            isOngoing && "animate-pulse"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight text-foreground">
            {incident.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{incident.serviceLabel}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>
              {isOngoing ? "Ongoing" : formatDuration(incident.durationMinutes)}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:inline",
            SEVERITY_BADGE[incident.severity]
          )}
        >
          {SEVERITY_LABEL[incident.severity]}
        </span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted-foreground"
        >
          <CaretRightIcon weight="bold" size={14} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-border"
          >
            <div className="px-4 py-4">
              <Timeline incident={incident} />
              {incident.url && incident.url !== "#" && (
                <div className="mt-4 border-t border-border pt-3">
                  <a
                    href={incident.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View full report on GitHub →
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function Timeline({ incident }: { incident: Incident }) {
  const isOngoing = incident.status === "ongoing";
  const entries: Array<{
    label: string;
    description: string;
    timestamp: string;
    accent: "resolved" | "active" | "info";
  }> = [];

  if (isOngoing) {
    entries.push({
      label: "Investigating",
      description: `We're investigating an issue affecting ${incident.serviceLabel}.`,
      timestamp: incident.startedAt,
      accent: "active",
    });
  } else {
    if (incident.resolvedAt) {
      entries.push({
        label: "Resolved",
        description: `${incident.serviceLabel} is fully operational again. Total downtime: ${formatDuration(incident.durationMinutes)}.`,
        timestamp: incident.resolvedAt,
        accent: "resolved",
      });
    }
    entries.push({
      label: "Identified",
      description: `An issue was detected affecting ${incident.serviceLabel}.`,
      timestamp: incident.startedAt,
      accent: "info",
    });
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
              entry.accent === "resolved" && "bg-foreground",
              entry.accent === "active" && "bg-warning animate-pulse",
              entry.accent === "info" && "bg-muted-foreground/60"
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-tight text-foreground">
              {entry.label}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {entry.description}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {formatTimestamp(entry.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-card hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function buildDays(incidents: Incident[]): Day[] {
  const days: Day[] = [];
  const today = startOfDay(new Date());
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    days.push({
      key,
      date,
      incidents: incidents.filter((incident) => {
        const start = startOfDay(new Date(incident.startedAt));
        return start.getTime() === date.getTime();
      }),
    });
  }
  return days;
}

function groupByMonth(
  incidents: Incident[]
): Array<{ label: string; incidents: Incident[] }> {
  const groups = new Map<string, Incident[]>();
  for (const incident of incidents) {
    const date = new Date(incident.startedAt);
    const label = date.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(incident);
  }
  return Array.from(groups.entries()).map(([label, list]) => ({
    label,
    incidents: list,
  }));
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDayLabel(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date
    .toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
    .toUpperCase();
}
