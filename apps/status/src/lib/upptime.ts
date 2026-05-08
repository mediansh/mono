export type UpptimeStatus = "up" | "down" | "degraded";

export interface UpptimeService {
  name: string;
  url: string;
  icon: string;
  slug: string;
  status: UpptimeStatus;
  uptime: string;
  uptimeDay: string;
  uptimeWeek: string;
  uptimeMonth: string;
  uptimeYear: string;
  time: number;
  timeDay: number;
  timeWeek: number;
  timeMonth: number;
  timeYear: number;
  dailyMinutesDown: Record<string, number>;
}

export const SUMMARY_URL =
  "https://raw.githubusercontent.com/mediansh/status/master/history/summary.json";

export interface ServiceConfig {
  slug: string;
  label: string;
  url?: string;
}

export const SERVICES: ServiceConfig[] = [
  { slug: "web", label: "Website", url: "median.sh" },
  { slug: "api", label: "API", url: "api.cloud.median.sh" },
  { slug: "feedback", label: "Feedback Processing" },
  { slug: "discord", label: "Discord Bot" },
];

export async function fetchSummary(): Promise<UpptimeService[]> {
  const res = await fetch(SUMMARY_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
  return (await res.json()) as UpptimeService[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type DayState = "up" | "partial" | "down" | "unknown";

export function buildDailyHistory(
  service: UpptimeService | undefined,
  days = 90
): { states: DayState[]; dayKeys: string[] } {
  const states: DayState[] = [];
  const dayKeys: string[] = [];
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    dayKeys.push(key);
    if (!service) {
      states.push("unknown");
      continue;
    }
    const minutesDown = service.dailyMinutesDown?.[key] ?? 0;
    if (minutesDown === 0) states.push("up");
    else if (minutesDown < 60) states.push("partial");
    else states.push("down");
  }

  return { states, dayKeys };
}

export type OverallState = "operational" | "degraded" | "outage" | "unknown";

export function deriveOverall(services: UpptimeService[]): OverallState {
  if (!services.length) return "unknown";
  const statuses = services.map((s) => s.status);
  if (statuses.every((s) => s === "up")) return "operational";
  if (statuses.some((s) => s === "down")) return "outage";
  return "degraded";
}
