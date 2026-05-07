import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Logo } from "./Logo";
import { StatusBanner } from "./StatusBanner";
import { StatusCard } from "./StatusCard";
import {
  deriveOverall,
  fetchSummary,
  SERVICES,
  type OverallState,
  type UpptimeService,
} from "../lib/upptime";

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
  const overall: OverallState = error
    ? "unknown"
    : services
      ? deriveOverall(services)
      : "unknown";

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-10 sm:py-16">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mb-8 flex items-center justify-center gap-2 text-foreground"
      >
        <Logo className="h-7 w-auto" />
        <span className="text-xl font-semibold tracking-tight">Status</span>
      </motion.header>

      <StatusBanner state={overall} loading={loading} />

      <div
        aria-hidden="true"
        className="my-7 h-px w-full bg-border"
      />

      <section className="flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {SERVICES.map((config, i) => {
            const service = services?.find((s) => s.slug === config.slug);
            return (
              <StatusCard
                key={config.slug}
                config={config}
                service={service}
                index={i}
              />
            );
          })}
        </AnimatePresence>
      </section>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 text-center text-xs text-muted-foreground"
        >
          Live data unavailable — showing cached layout.
        </motion.p>
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
