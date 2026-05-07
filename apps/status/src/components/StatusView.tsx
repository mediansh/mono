import { AnimatePresence, motion } from "motion/react";
import { Logo } from "./Logo";
import { StatusBanner } from "./StatusBanner";
import { StatusCard } from "./StatusCard";
import {
  deriveOverall,
  SERVICES,
  type OverallState,
  type UpptimeService,
} from "../lib/upptime";
import type { Incident } from "../lib/incidents";

interface StatusViewProps {
  services: UpptimeService[] | null;
  incidents?: Incident[];
  loading?: boolean;
  error?: string | null;
  overrideState?: OverallState;
  footerNote?: React.ReactNode;
}

export function StatusView({
  services,
  incidents = [],
  loading = false,
  error = null,
  overrideState,
  footerNote,
}: StatusViewProps) {
  const overall: OverallState =
    overrideState ??
    (error ? "unknown" : services ? deriveOverall(services) : "unknown");

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

      <div aria-hidden="true" className="my-7 h-px w-full bg-border" />

      <section className="flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {SERVICES.map((config, i) => {
            const service = services?.find((s) => s.slug === config.slug);
            return (
              <StatusCard
                key={config.slug}
                config={config}
                service={service}
                incidents={incidents}
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

      {footerNote}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-8 flex justify-center"
      >
        <a
          href="/incidents"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View incident history →
        </a>
      </motion.div>

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
