/**
 * Test-support module for the Studio's canvas tests. Not exported from any barrel.
 *
 * It exists because a dirty draft cannot be faked: `moveNode` and `connectFields` are the only two
 * edits the Studio can make, and both arrive from React Flow. `StudioApp.e2e.test.tsx` and
 * `StudioApp/StudioApp.test.tsx` both need one, so the gesture lives here rather than in whichever
 * of them wrote it first.
 */

/**
 * Drives one real React Flow node drag through the DOM events `d3-drag` (via `@xyflow/system`'s
 * `XYDrag`) actually listens for. `FlowCanvas` never touches pointer events for node dragging — it
 * hands the whole node off to `d3-drag`, which binds `mousedown`/`mousemove`/`mouseup` and reads
 * `event.view` to find the window it should track the rest of the gesture on. jsdom's `MouseEvent`
 * constructor rejects a `view` that is not exactly its own `Window`-branded object even when given
 * `window` itself, so it is patched onto the constructed event afterwards instead.
 *
 * `d3-drag`'s own gesture only "starts" once one move exceeds its drag threshold; that FIRST move
 * establishes the gesture's own baseline pointer position, and only a SUBSEQUENT move's delta from
 * that baseline reaches `onNodeDragStop`. The first move below is therefore a small, disposable
 * threshold-crosser, and `dx`/`dy` are the delta applied by the second — confirmed empirically
 * against this exact drag stack before being written into this helper.
 */
export function dragNode(container: HTMLElement, nodeId: string, dx: number, dy: number): void {
  const nodeEl = container.querySelector(`.react-flow__node[data-id="${nodeId}"]`)
  if (nodeEl === null) throw new Error(`dragNode: no rendered React Flow node for "${nodeId}"`)

  const dispatch = (target: EventTarget, type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
    })
    Object.defineProperty(event, 'view', { value: window, configurable: true })
    target.dispatchEvent(event)
  }

  const startX = 200
  const startY = 200
  dispatch(nodeEl, 'mousedown', startX, startY)
  dispatch(window, 'mousemove', startX + 3, startY + 3)
  dispatch(window, 'mousemove', startX + 3 + dx, startY + 3 + dy)
  dispatch(window, 'mouseup', startX + 3 + dx, startY + 3 + dy)
}
