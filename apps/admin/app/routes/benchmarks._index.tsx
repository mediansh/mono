import { useState } from "react"
import { Link } from "react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  ChartBar,
  Lightning,
  Plus,
  Trash,
} from "@phosphor-icons/react"

import { api, type Id } from "~/lib/convex"
import { fadeUp, stagger } from "~/lib/utils"

function Spinner() {
  return (
    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function formatTime(ms?: number) {
  if (!ms) return "—"
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function statusPillClass(status: string) {
  if (status === "complete") return "bg-emerald-500/15 text-emerald-600"
  if (status === "running") return "bg-amber-500/15 text-amber-600"
  return "bg-destructive/15 text-destructive"
}

export default function AdminBenchmarksPage() {
  const models = useQuery(api.benchmarks.listModels)
  const suiteRuns = useQuery(api.benchmarks.listSuiteRuns, { limit: 20 })

  const addModel = useMutation(api.benchmarks.addModel)
  const removeModel = useMutation(api.benchmarks.removeModel)
  const trigger = useAction(api.benchmarks.triggerSuiteRun)

  const [slug, setSlug] = useState("")
  const [provider, setProvider] = useState("")
  const [adding, setAdding] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")

  const hasRunning =
    suiteRuns?.some((run) => run.status === "running") ?? false

  async function handleAdd() {
    setAdding(true)
    setError("")
    try {
      await addModel({
        slug: slug.trim(),
        provider: provider.trim() || undefined,
      })
      setSlug("")
      setProvider("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add model.")
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: Id<"benchmarkModels">) {
    setPendingId(id)
    try {
      await removeModel({ id })
    } finally {
      setPendingId(null)
    }
  }

  async function handleRun() {
    setRunning(true)
    setError("")
    try {
      await trigger({})
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start benchmark.")
    } finally {
      setRunning(false)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10"
    >
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-[15px] leading-tight font-semibold">Benchmarks</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Replay production prompts against OpenRouter models to compare speed
          and quality side-by-side.
        </p>
      </motion.div>

      {error && (
        <motion.p
          variants={fadeUp}
          className="mb-3 text-[12px] text-destructive"
        >
          {error}
        </motion.p>
      )}

      <motion.div
        variants={fadeUp}
        className="mb-6 border border-sidebar-border bg-sidebar/30 p-4"
      >
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
          <Plus size={14} weight="bold" />
          Add model
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="OpenRouter slug — e.g. anthropic/claude-haiku-4.5"
            className="h-9 flex-1 bg-background px-3 text-[13px] ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-foreground/30"
          />
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Provider lock (optional)"
            className="h-9 w-full bg-background px-3 text-[13px] ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-foreground/30 sm:w-52"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || slug.trim().length === 0}
            className="flex h-9 items-center justify-center gap-1.5 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? <Spinner /> : <Plus size={14} weight="bold" />}
            <span>Add</span>
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-8">
        <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">
          Models
        </h2>
        <div className="overflow-x-auto border border-sidebar-border">
          <div className="min-w-[480px]">
            <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <div className="flex-1">Slug</div>
              <div className="w-40">Provider lock</div>
              <div className="w-12" />
            </div>
            {models === undefined && (
              <div className="px-3 py-4 text-[12px] text-muted-foreground">
                Loading…
              </div>
            )}
            {models?.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-muted-foreground">
                No models registered yet.
              </div>
            )}
            {models?.map((model) => (
              <div
                key={model._id}
                className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] last:border-b-0"
              >
                <div className="flex-1 truncate font-mono text-[12px]">
                  {model.slug}
                </div>
                <div className="w-40 truncate text-muted-foreground">
                  {model.provider ?? "—"}
                </div>
                <div className="flex w-12 justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemove(model._id)}
                    disabled={pendingId === model._id}
                    className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive disabled:opacity-50"
                    aria-label="Remove model"
                  >
                    {pendingId === model._id ? <Spinner /> : <Trash size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-3 flex items-center justify-between">
        <h2 className="text-[12px] font-medium text-muted-foreground">
          Suite runs
        </h2>
        <button
          type="button"
          onClick={handleRun}
          disabled={running || hasRunning || (models?.length ?? 0) === 0}
          className="flex h-9 items-center justify-center gap-1.5 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? <Spinner /> : <Lightning size={14} weight="fill" />}
          <span>{hasRunning ? "Run in progress…" : "Run benchmark"}</span>
        </button>
      </motion.div>

      <motion.div variants={fadeUp} className="overflow-x-auto border border-sidebar-border">
        <div className="min-w-[520px]">
          <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <div className="w-24">Status</div>
            <div className="w-40">Started</div>
            <div className="w-20">Models</div>
            <div className="w-32">Progress</div>
            <div className="flex-1" />
          </div>
          {suiteRuns === undefined && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              Loading…
            </div>
          )}
          {suiteRuns?.length === 0 && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground">
              No benchmark runs yet.
            </div>
          )}
          {suiteRuns?.map((run) => (
            <Link
              key={run._id}
              to={`/benchmarks/runs/${run._id}`}
              className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[12px] transition-colors last:border-b-0 hover:bg-sidebar-accent"
            >
              <div className="w-24">
                <span
                  className={`inline-block px-1.5 py-0.5 text-[11px] font-medium ${statusPillClass(run.status)}`}
                >
                  {run.status}
                </span>
              </div>
              <div className="w-40 text-muted-foreground">
                {formatTime(run.startedAt)}
              </div>
              <div className="w-20 text-muted-foreground">
                {run.models.length}
              </div>
              <div className="w-32 text-muted-foreground">
                {run.completedRunCount}/{run.expectedRunCount}
              </div>
              <div className="flex flex-1 items-center justify-end gap-1 text-muted-foreground">
                <ChartBar size={12} />
                <span>View</span>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
