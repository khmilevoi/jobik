/**
 * Monotonic, process-local run numbers — the `#219` the run panel header shows.
 *
 * One counter per flow, keyed by the absolute path the flow is bound to, because that path is the
 * flow's identity on disk. Keying on the path rather than on the bound object means a server that
 * reloads a binding keeps counting where the previous one stopped. Nothing here is persisted: run
 * numbers do not survive a restart, which is the spec's deferred `Persisted run history`.
 */
const counters = new Map<string, number>()

/** The next number for one flow. The first run of a flow in a process is `#1`. */
export function nextRunNumber(flowPath: string): number {
  const next = (counters.get(flowPath) ?? 0) + 1
  counters.set(flowPath, next)
  return next
}
