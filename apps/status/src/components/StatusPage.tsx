import { useEffect, useState } from "react";
import { StatusView } from "./StatusView";
import { fetchSummary, type UpptimeService } from "../lib/upptime";

export function StatusPage() {
  const [services, setServices] = useState<UpptimeService[] | null>(null);
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
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = services === null && !error;

  return <StatusView services={services} loading={loading} error={error} />;
}
