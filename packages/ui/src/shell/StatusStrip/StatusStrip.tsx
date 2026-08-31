import { useEffect, useState } from 'react'
import s from './StatusStrip.module.css'

/**
 * `3D` §3D.3, the valid board's bottom strip: a 32 px row saying the flow checked out, what it
 * checked, and how to check it again.
 *
 * **Why it is not always on screen.** No other artboard draws a strip at all — `Studio — default`,
 * `panels collapsed`, `run in progress` and `2A` all end at the canvas. `3D`'s own caption is what
 * reconciles that: *"A valid flow changes almost nothing: the chip, the status strip, and Run
 * becomes available."* The strip is one of the things validating a flow **changes**, so it appears
 * with a result and goes away with it, which is exactly what the other four artboards show — a
 * flow nobody has checked yet.
 *
 * Every value here is real. `2 nodes · 2 connections` is the descriptor and the document's own
 * connection list, and `checked <n> s ago` is measured from the moment the check actually
 * answered. Nothing is a fixture.
 */

export interface StatusStripProps {
  readonly nodeCount: number
  readonly connectionCount: number
  /** When the check answered, as `Date.now()`. The strip re-reads the clock once a second. */
  readonly checkedAt: number
  /** Test seam. The Studio never passes one. */
  readonly now?: () => number
}

/** `1 node · 1 connection`, `2 nodes · 2 connections` — the copy convention `07-copy.md` §12 fixes. */
function plural(count: number, noun: string): string {
  return count === 1 ? `${count} ${noun}` : `${count} ${noun}s`
}

/** How long ago, in whole seconds. Never negative: a clock that jumps back reads as `0 s`. */
export function checkedAgo(checkedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - checkedAt) / 1000))
  return `checked ${seconds} s ago`
}

const TICK_MS = 1000

export function StatusStrip(props: StatusStripProps) {
  const now = props.now ?? Date.now
  const [tick, setTick] = useState(0)

  // The one moving part: `checked 12 s ago` counts up while the result stands.
  useEffect(() => {
    const handle = setInterval(() => setTick((value) => value + 1), TICK_MS)
    return () => clearInterval(handle)
  }, [])

  void tick

  const meta = [
    plural(props.nodeCount, 'node'),
    plural(props.connectionCount, 'connection'),
    checkedAgo(props.checkedAt, now()),
  ].join(' · ')

  return (
    <div data-testid="studio-status-strip" className={s.strip}>
      <div className={s.dot} />
      <div data-testid="studio-status-label" className={s.label}>
        No issues
      </div>
      <div data-testid="studio-status-meta" className={s.meta}>
        {meta}
      </div>
      <div className={s.spacer} />
      <div className={s.shortcut}>⌘⇧V</div>
    </div>
  )
}
