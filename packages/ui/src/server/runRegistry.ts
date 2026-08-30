import { randomUUID } from 'node:crypto'

/**
 * The runs currently in flight, so `POST /api/runs/:token/cancel` can reach one.
 *
 * Keyed by an opaque token the server mints, not by the run number: `### Progress and cancellation`
 * lets the editor cancel "while it is in flight", and a run number does not exist until P9's
 * engine has already started. The token is handed to the client on the stream's first line, before
 * any node runs, so there is no window in which a run cannot be cancelled.
 *
 * Process-local and never persisted, exactly as run numbers are. Nothing here aborts anything by
 * itself: it holds `AbortController`s and lets a route abort one by name.
 */

const inFlight = new Map<string, AbortController>()

/** Register a run and mint the token the browser cancels it with. */
export function registerRun(controller: AbortController): string {
  const token = randomUUID()
  inFlight.set(token, controller)
  return token
}

/** Abort the run behind `token`. `false` means the token is unknown or the run already ended. */
export function cancelRun(token: string): boolean {
  const controller = inFlight.get(token)
  if (controller === undefined) return false
  controller.abort()
  return true
}

/** Forget a settled run. Always called, on every path, so a token cannot outlive its run. */
export function releaseRun(token: string): void {
  inFlight.delete(token)
}

/** How many runs are still registered. A leak canary for the route tests. */
export function inFlightRunCount(): number {
  return inFlight.size
}
