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
    const sorted = [...incidents].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    if (filter === "all") return sorted;
    return sorted.filter((i) => i.serviceSlug === filter);
  }, [incidents, filter]);

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
          Past incidents and outages across Median services.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6 flex flex-wrap gap-1"
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
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-[68px] animate-pulse rounded-[var(--radius)] bg-card"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </ul>
      )}

      {!error && incidents !== null && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-6 py-14 text-center"
        >
          <CheckCircleIcon
            weight="fill"
            size={36}
            className="text-foreground"
          />
          <div>
            <p className="text-sm font-medium">No incidents reported</p>
            <p className="mt-1 text-xs text-muted-foreground">
              All clear — every service has been operational.
            </p>
          </div>
        </motion.div>
      )}

      {!error && incidents !== null && filtered.length > 0 && (
        <ul className="flex flex-col gap-2">
          {filtered.map((incident, i) => (
            <IncidentCard
              key={incident.number}
              incident={incident}
              index={i}
            />
          ))}
        </ul>
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

function IncidentCard({
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
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.25) }}
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
            <span>{formatDate(incident.startedAt)}</span>
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(iso: string): string {
  return new Date(iso)
    .toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
    .toUpperCase();
}
