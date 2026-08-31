/**
 * The two time formats the artboards fix.
 *
 * `ok · 2.1s` and `Last run · 2.4s` are one decimal with a trailing `s`; the live log's mono stamp
 * (`0.31`) is two decimals with no unit. P11's `format.ts` formats already-formatted strings; these
 * are the two that turn a millisecond count into one.
 */

export function formatElapsed(elapsedMs: number): string {
  const clamped = elapsedMs > 0 ? elapsedMs : 0
  return `${(clamped / 1000).toFixed(1)}s`
}

export function formatLogTime(offsetMs: number): string {
  const clamped = offsetMs > 0 ? offsetMs : 0
  return (clamped / 1000).toFixed(2)
}
