import type { OptimisticLocalStore } from "convex/browser"
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server"

export function updateOptimisticQuery<Query extends FunctionReference<"query">>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: FunctionArgs<Query>,
  updater: (current: FunctionReturnType<Query>) => FunctionReturnType<Query>
) {
  const current = localStore.getQuery(query, args)
  if (current === undefined) {
    return
  }

  localStore.setQuery(query, args, updater(current))
}
