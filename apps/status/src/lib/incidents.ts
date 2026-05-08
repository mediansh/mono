import { SERVICES } from "./upptime";

export interface RawGithubIssue {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  labels: Array<{ name: string }>;
}

export interface Incident {
  number: number;
  title: string;
  url: string;
  serviceSlug: string | null;
  serviceLabel: string;
  status: "ongoing" | "resolved";
  severity: "down" | "degraded" | "incident";
  startedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
}

const ISSUES_URL =
  "https://api.github.com/repos/mediansh/status/issues?state=all&per_page=100&labels=status";

const SERVICE_SLUGS = new Set(SERVICES.map((s) => s.slug));

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(ISSUES_URL, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const issues = (await res.json()) as RawGithubIssue[];
  return issues.map(parseIncident);
}

function parseIncident(issue: RawGithubIssue): Incident {
  const labelNames = issue.labels.map((l) => l.name.toLowerCase());

  let serviceSlug: string | null = null;
  for (const label of labelNames) {
    if (SERVICE_SLUGS.has(label)) {
      serviceSlug = label;
      break;
    }
  }
  if (!serviceSlug) {
    const titleLower = issue.title.toLowerCase();
    for (const slug of SERVICE_SLUGS) {
      if (titleLower.includes(slug)) {
        serviceSlug = slug;
        break;
      }
    }
  }

  const config = SERVICES.find((s) => s.slug === serviceSlug);
  const titleLower = issue.title.toLowerCase();
  const severity: Incident["severity"] = titleLower.includes("degraded")
    ? "degraded"
    : titleLower.includes("down")
      ? "down"
      : "incident";

  const startedAt = issue.created_at;
  const resolvedAt = issue.closed_at;
  const durationMinutes = resolvedAt
    ? Math.max(
        1,
        Math.round(
          (new Date(resolvedAt).getTime() - new Date(startedAt).getTime()) /
            60000
        )
      )
    : null;

  return {
    number: issue.number,
    title: cleanTitle(issue.title),
    url: issue.html_url,
    serviceSlug,
    serviceLabel: config?.label ?? serviceSlug ?? "Unknown service",
    status: issue.state === "closed" ? "resolved" : "ongoing",
    severity,
    startedAt,
    resolvedAt,
    durationMinutes,
  };
}

function cleanTitle(title: string): string {
  // Strip leading emoji + space (🛑 / ⚠️ etc.)
  return title.replace(/^[^\w]+/, "").trim();
}

export function dayKey(d: Date): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

export function incidentsForDay(
  incidents: Incident[],
  serviceSlug: string,
  day: string
): Incident[] {
  return incidents
    .filter((i) => i.serviceSlug === serviceSlug)
    .filter((i) => {
      const startDay = dayKey(new Date(i.startedAt));
      const endDay = i.resolvedAt
        ? dayKey(new Date(i.resolvedAt))
        : dayKey(new Date());
      return startDay <= day && day <= endDay;
    });
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Ongoing";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}
