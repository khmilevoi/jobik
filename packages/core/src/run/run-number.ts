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

/**
 * Give back a number whose run never started, so the next run reuses it.
 *
 * `runFlow` claims the number when the request ARRIVES rather than when execution begins — that is
 * what makes concurrent runs numbered in the order Run was pressed instead of the order their
 * document reads and validations happen to finish. Claiming early would otherwise burn a number on
 * every rejected run, and a rejection is ordinary Studio traffic: an empty required field is one.
 * The run history would then be pitted with gaps that name nothing.
 *
 * The rollback is refused unless `runNumber` is still the highest this flow has handed out. A
 * number below the high-water mark cannot be returned without either reusing a number a live run
 * already carries or handing a later run a smaller number than an earlier one, and both are worse
 * than the gap. So a rejection that overlaps a concurrent run does leave a gap; a rejection on an
 * idle flow — which is the case a user actually meets — leaves none.
 *
 * Only ever called for a run that never reached the engine. A number that reached `executeRunGraph`
 * is spent.
 */
export function releaseRunNumber(flowPath: string, runNumber: number): void {
  if (counters.get(flowPath) !== runNumber) return
  counters.set(flowPath, runNumber - 1)
}
