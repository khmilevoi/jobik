import {
  type Atom,
  action,
  atom,
  type Computed,
  computed,
  onEvent,
  peek,
  withConnectHook,
} from '@reatom/core'
import { outputMetrics } from '#output/outputTokens.js'
import type { OutputViewerTab } from '#output/tabs.js'

/**
 * `2A`'s dock, minus its markup: the tab it is on, how tall it has been dragged, and the two window
 * listener groups that used to be `useEffect`s inside the component.
 *
 * ## Why this is a model at all, and why it is not *the* model
 *
 * None of these three values has a home in `model/types.ts`, and inventing one would be inventing
 * state: which pane of one surface you are looking at, and how tall you have dragged one element,
 * are facts about a rendered dock rather than about the flow, the run or the output — two docks on
 * one page are two heights, and neither is anything a second surface could read. So they stay with
 * the component, exactly as `FlowCanvas` keeps React Flow's node array and `ModalShell` keeps the
 * element that had focus.
 *
 * **What is not negotiable is the ownership of the listeners**, and that is the whole reason this
 * file exists rather than three `useState`s. RTM-A06 and RTM-L01: every listener is installed by
 * `onEvent` inside a `withConnectHook` that returns its own cleanup, so its lifetime is a
 * connection instead of a dependency array — and, because a React render is what connects an atom,
 * a group that this dock's render does not read is a group that is not installed at all. The
 * pointer trio therefore exists exactly while a pointer is down, which is what the `useEffect`
 * keyed on `drag` bought before, and `escBound` exists only while the dock is open with a close
 * handler wired.
 *
 * It is deliberately **not** on `output/index.ts`: the root barrel re-exports that file wholesale,
 * and this is one component's own state rather than something a consumer should reach for.
 * `shell/statusClock.ts` is the same shape for the same reason.
 */

/**
 * The dock cannot be dragged shorter than the chrome it always draws. This is a physical floor,
 * not a design value: `10-output-dock.md` §2.1 states "No minimum or maximum height".
 */
export const MIN_DOCK_HEIGHT = outputMetrics.dockHandleHeight + outputMetrics.headerHeight

/** Where the pointer went down, and how tall the dock was at that moment. */
interface Drag {
  readonly startY: number
  readonly startHeight: number
}

export interface DockState {
  /** The pane the dock draws. A caller driving `tab` from outside overrides it without writing it. */
  readonly tab: Atom<OutputViewerTab>
  /** The dragged height, in pixels, clamped at {@link MIN_DOCK_HEIGHT}. */
  readonly height: Atom<number>
  /** Whether a pointer is down on the handle — the render reads it to install the trio. */
  readonly dragging: Computed<boolean>
  /**
   * `true` while the `pointermove`/`pointerup`/`pointercancel` trio is installed. Reading it is
   * what installs them; dropping the read is what removes them.
   */
  readonly tracking: Atom<boolean>
  /** `true` while the window `keydown` listener is installed, on the same terms. */
  readonly escBound: Atom<boolean>
  /** The handle's `pointerdown`. Everything after it is the trio's. */
  readonly startResize: (startY: number) => void
}

export function reatomDockState(
  input: {
    readonly initialTab: OutputViewerTab
    readonly initialHeight: number
    /**
     * What `esc` runs, and what the trio reports a new height to. Both read the props the dock was
     * last rendered with, so a listener that fires between two renders calls the current handler
     * rather than the one that happened to be there when this state was built.
     */
    readonly onClose: () => void
    readonly onHeightChange: (height: number) => void
  },
  name: string,
): DockState {
  const tab = atom(input.initialTab, `${name}.tab`)
  const height = atom(input.initialHeight, `${name}.height`)
  const drag = atom<Drag | undefined>(undefined, `${name}.drag`)

  const dragging = computed(() => drag() !== undefined, `${name}.dragging`)

  const startResize = action((startY: number) => {
    drag.set({ startY, startHeight: peek(height) })
  }, `${name}.startResize`)

  /**
   * The drag itself. `peek` rather than a plain read because these callbacks run inside the frame
   * the connect hook owns, and nothing here is a dependency of anything — the trio reacts to the
   * pointer, not to an atom.
   */
  const tracking = atom(false, `${name}.tracking`).extend(
    withConnectHook(() => {
      const move = (event: PointerEvent): void => {
        const current = peek(drag)
        if (current === undefined) return
        const next = Math.max(
          MIN_DOCK_HEIGHT,
          current.startHeight - (event.clientY - current.startY),
        )
        height.set(next)
        input.onHeightChange(next)
      }
      const release = (): void => {
        drag.set(undefined)
      }
      const off = [
        onEvent(globalThis, 'pointermove', move),
        onEvent(globalThis, 'pointerup', release),
        onEvent(globalThis, 'pointercancel', release),
      ]
      tracking.set(true)
      return () => {
        for (const stop of off) stop()
        tracking.set(false)
      }
    }),
  )

  /**
   * `10-output-dock.md` §4 — "a `window` `keydown` listener … closes the dock globally, from
   * anywhere in the app". It is the dock's own behaviour, so it is bound here and not in the shell.
   *
   * `model/shortcuts.ts` binds `esc` too, and deliberately: inside the Studio that binding is the
   * one that matters, because it alone knows the priority order — a modal that already answered the
   * press, then the viewer, then a run in flight. This one is what a dock rendered outside the
   * Studio still has, and closing an already-closed viewer is a no-op, so the two cannot disagree.
   */
  const escBound = atom(false, `${name}.escBound`).extend(
    withConnectHook(() => {
      const off = onEvent(globalThis, 'keydown', (event) => {
        if (event.key === 'Escape') input.onClose()
      })
      escBound.set(true)
      return () => {
        off()
        escBound.set(false)
      }
    }),
  )

  return { tab, height, dragging, tracking, escBound, startResize }
}
