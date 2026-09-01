import type { NodeOverlay } from '#studio/graphModel.js'
import type { NodeCardData, NodeFieldSpec } from './types.js'

/**
 * One card's structural data, decorated with what the run has said about that node.
 *
 * This is the half of `studio/graphModel.ts`'s `toCanvasNodes` that used to run inside the node
 * ARRAY. It runs inside the card instead, because the array is what `FlowCanvas` syncs its React
 * Flow state from: folding a run into it gave the array a new identity on every stream frame, and
 * an in-flight drag went with it. `model/canvas.tsx`'s `nodes` now carries structure alone and
 * `NodeCard` asks `CanvasModel.nodeOverlay(id)` for its own decoration, so a `node-status` line
 * reaches the one card it is about and the array never moves.
 *
 * The precedence is `toCanvasNodes`'s, unchanged, because the two have to agree while both exist:
 * the overlay wins wherever it says anything, and `data` is what shows through where it does not.
 * A card rendered on its own — with a `data` a caller wrote and no run behind it — therefore draws
 * exactly what it was handed: {@link applyNodeOverlay} hands `data` straight back when there is no
 * overlay, identity included, so an undecorated card costs nothing at all.
 *
 * The conditional spreads are load-bearing rather than stylistic. `status: overlay.status` would
 * write the key whatever the value is, and an overlay that says nothing about a field would erase
 * what `data` said about it — the difference between decorating a card and replacing it.
 */
export function applyNodeOverlay(
  data: NodeCardData,
  overlay: NodeOverlay | undefined,
): NodeCardData {
  if (overlay === undefined) return data
  return {
    ...data,
    state: overlay.state,
    ...(data.inputs === undefined
      ? {}
      : { inputs: annotate(data.inputs, overlay.inputAnnotation) }),
    ...(data.outputs === undefined
      ? {}
      : { outputs: annotate(data.outputs, overlay.outputAnnotation) }),
    ...(overlay.status === undefined ? {} : { status: overlay.status }),
    ...(overlay.elapsed === undefined ? {} : { elapsed: overlay.elapsed }),
    ...(overlay.progress === undefined ? {} : { progress: overlay.progress }),
    ...(overlay.detail === undefined ? {} : { detail: overlay.detail }),
    ...(overlay.outputSlot === undefined ? {} : { outputSlot: overlay.outputSlot }),
    ...(overlay.statusDot === undefined ? {} : { statusDot: overlay.statusDot }),
  }
}

/**
 * `### Node cards`: a run replaces every field's type annotation with `received`, `pending` or
 * `waiting` — except on a port `3D` has marked, whose annotation is the finding's own word and
 * outranks both. `toCanvasNodes` spells that as `problem?.annotation ?? overlay?.inputAnnotation ??
 * field.annotation`; here the mark has already been applied, and `NodeFieldSpec.problem` is what
 * says so.
 */
function annotate(
  fields: readonly NodeFieldSpec[],
  annotation: string | undefined,
): readonly NodeFieldSpec[] {
  if (annotation === undefined) return fields
  return fields.map((field) => (field.problem === undefined ? { ...field, annotation } : field))
}
