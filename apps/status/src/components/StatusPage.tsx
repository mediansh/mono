import { useEffect, useState } from "react";
import { StatusView } from "./StatusView";
import { fetchSummary, type UpptimeService } from "../lib/upptime";
import { fetchIncidents, type Incident } from "../lib/incidents";

export function StatusPage() {
  const [services, setServices] = useState<UpptimeService[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSummary()
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      });
    fetchIncidents()
      .then((data) => {
        if (!cancelled) setIncidents(data);
      })
      .catch(() => {
        // Incidents are optional — we still render the page without them.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = services === null && !error;

  return (
    <StatusView
      services={services}
      incidents={incidents}
      loading={loading}
      error={error}
    />
  );
}
