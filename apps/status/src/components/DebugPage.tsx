import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { StatusView } from "./StatusView";
import {
  SERVICES,
  type OverallState,
  type UpptimeService,
  type UpptimeStatus,
} from "../lib/upptime";
import type { Incident } from "../lib/incidents";
import { cn } from "../lib/cn";

const STATUS_OPTIONS: UpptimeStatus[] = ["up", "degraded", "down"];
const OVERALL_OPTIONS: Array<OverallState | "auto"> = [
  "auto",
  "operational",
  "degraded",
  "outage",
  "unknown",
];

type DebugServiceState = {
  status: UpptimeStatus;
  uptime: string;
  outageDays: number;
  partialDays: number;
};

const DEFAULT_DEBUG: Record<string, DebugServiceState> = Object.fromEntries(
  SERVICES.map((s) => [
    s.slug,
    { status: "up", uptime: "100.00%", outageDays: 0, partialDays: 0 },
  ])
);

function buildDailyMinutesDown(
  outageDays: number,
  partialDays: number
): Record<string, number> {
  const result: Record<string, number> = {};
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const totalDays = 90;
  const outagePicks = new Set<number>();
  while (outagePicks.size < Math.min(outageDays, totalDays)) {
    outagePicks.add(Math.floor(Math.random() * totalDays));
  }
  const partialPicks = new Set<number>();
  while (
    partialPicks.size < Math.min(partialDays, totalDays - outagePicks.size)
  ) {
    const pick = Math.floor(Math.random() * totalDays);
    if (!outagePicks.has(pick)) partialPicks.add(pick);
  }
  for (let i = 0; i < totalDays; i++) {
    if (outagePicks.has(i)) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      result[date.toISOString().slice(0, 10)] = 720;
    } else if (partialPicks.has(i)) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      result[date.toISOString().slice(0, 10)] = 15;
    }
  }
  return result;
}

function syntheticIncidents(
  services: UpptimeService[]
): Incident[] {
  let counter = 1;
  const incidents: Incident[] = [];
  for (const service of services) {
    const cfg = SERVICES.find((s) => s.slug === service.slug);
    for (const [day, minutes] of Object.entries(service.dailyMinutesDown)) {
      const severity: Incident["severity"] = minutes >= 60 ? "down" : "degraded";
      const startedAt = `${day}T08:00:00Z`;
      const resolvedAt = new Date(
        new Date(startedAt).getTime() + minutes * 60000
      ).toISOString();
      incidents.push({
        number: counter++,
        title: `${cfg?.label ?? service.slug} ${
          severity === "down" ? "is down" : "is degraded"
        }`,
        url: "#",
        serviceSlug: service.slug,
        serviceLabel: cfg?.label ?? service.slug,
        status: "resolved",
        severity,
        startedAt,
        resolvedAt,
        durationMinutes: minutes,
      });
    }
  }
  return incidents.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

function syntheticServices(
  state: Record<string, DebugServiceState>,
  seed: number
): UpptimeService[] {
  void seed;
  return SERVICES.map((cfg) => {
    const s = state[cfg.slug];
    return {
      name: cfg.slug,
      url: cfg.url ? `https://${cfg.url}` : "",
      icon: "",
      slug: cfg.slug,
      status: s.status,
      uptime: s.uptime,
      uptimeDay: s.uptime,
      uptimeWeek: s.uptime,
      uptimeMonth: s.uptime,
      uptimeYear: s.uptime,
      time: 200,
      timeDay: 200,
      timeWeek: 200,
      timeMonth: 200,
      timeYear: 200,
      dailyMinutesDown: buildDailyMinutesDown(s.outageDays, s.partialDays),
    };
  });
}

export function DebugPage() {
  const [state, setState] = useState(DEFAULT_DEBUG);
  const [overall, setOverall] = useState<OverallState | "auto">("auto");
  const [loading, setLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [historySeed, setHistorySeed] = useState(0);

  const services = useMemo(
    () => syntheticServices(state, historySeed),
    [state, historySeed]
  );
  const incidents = useMemo(() => syntheticIncidents(services), [services]);

  const updateService = (slug: string, patch: Partial<DebugServiceState>) => {
    setState((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
  };

  const presets = {
    "All up": () => {
      setState(DEFAULT_DEBUG);
      setOverall("auto");
      setShowError(false);
      setLoading(false);
      setHistorySeed((s) => s + 1);
    },
    Degraded: () => {
      setState({
        ...DEFAULT_DEBUG,
        api: {
          status: "degraded",
          uptime: "99.21%",
          outageDays: 0,
          partialDays: 6,
        },
      });
      setOverall("auto");
      setShowError(false);
      setLoading(false);
      setHistorySeed((s) => s + 1);
    },
    Outage: () => {
      setState({
        ...DEFAULT_DEBUG,
        web: {
          status: "down",
          uptime: "97.82%",
          outageDays: 2,
          partialDays: 3,
        },
        feedback: {
          status: "degraded",
          uptime: "99.50%",
          outageDays: 0,
          partialDays: 4,
        },
      });
      setOverall("auto");
      setShowError(false);
      setLoading(false);
      setHistorySeed((s) => s + 1);
    },
    Loading: () => {
      setLoading(true);
      setShowError(false);
    },
    Error: () => {
      setLoading(false);
      setShowError(true);
    },
  };

  return (
    <div className="min-h-svh">
      <motion.section
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="border-b border-border bg-card"
      >
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Status Debug
              </h1>
              <p className="text-xs text-muted-foreground">
                Drive the status page from synthetic data.
              </p>
            </div>
            <a
              href="/"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              View live
            </a>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(presets).map(([label, fn]) => (
              <button
                key={label}
                onClick={fn}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-5">
            <Label>Overall state override</Label>
            <Pills
              options={OVERALL_OPTIONS}
              value={overall}
              onChange={setOverall}
            />
          </div>

          <div className="mb-2">
            <Label>Per-service controls</Label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SERVICES.map((cfg) => {
              const s = state[cfg.slug];
              return (
                <div
                  key={cfg.slug}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">{cfg.label}</span>
                    <code className="text-[10px] text-muted-foreground">
                      {cfg.slug}
                    </code>
                  </div>
                  <Pills
                    options={STATUS_OPTIONS}
                    value={s.status}
                    onChange={(v) => updateService(cfg.slug, { status: v })}
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Field
                      label="Uptime"
                      value={s.uptime}
                      onChange={(uptime) => updateService(cfg.slug, { uptime })}
                    />
                    <NumField
                      label="Down days"
                      value={s.outageDays}
                      max={90}
                      onChange={(outageDays) => {
                        updateService(cfg.slug, { outageDays });
                        setHistorySeed((x) => x + 1);
                      }}
                    />
                    <NumField
                      label="Partial days"
                      value={s.partialDays}
                      max={90}
                      onChange={(partialDays) => {
                        updateService(cfg.slug, { partialDays });
                        setHistorySeed((x) => x + 1);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.section>

      <StatusView
        services={loading ? null : services}
        incidents={loading ? [] : incidents}
        loading={loading}
        error={showError ? "Synthetic error" : null}
        overrideState={overall === "auto" ? undefined : overall}
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            value === opt
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-muted"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-foreground"
      />
    </label>
  );
}

function NumField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, +e.target.value)))}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-foreground"
      />
    </label>
  );
}
