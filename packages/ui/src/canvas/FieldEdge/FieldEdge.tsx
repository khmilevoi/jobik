import { reatomComponent } from '@reatom/react'
import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import { fieldEdgeClass, fieldEdgePath } from '#canvas/edgePaths.js'
import type { FieldEdgeData, FieldEdgeTone } from '#canvas/types.js'
import { useStudioModel } from '#model/context.js'

export type FieldEdgeType = Edge<FieldEdgeData, 'fieldEdge'>

const fallback: FieldEdgeData = { tone: 'idle', shape: 'curved' }

/**
 * `3D`'s failing edge outranks the run. An edge the last validation says cannot carry its value
 * must not read as one that is carrying it, and the failure tone is the mark pointing at the
 * problem. Every other document-derived tone — the accent one leaving the selected start, the idle
 * one — defers to what the run is doing, and takes it back the moment the run stops saying it.
 */
function resolveTone(stated: FieldEdgeTone, fromRun: FieldEdgeTone | undefined): FieldEdgeTone {
  if (stated === 'error') return stated
  return fromRun ?? stated
}

/**
 * The `edgeTypes` entry. The document's half of the tone travels in `data`, filled by `FlowCanvas`;
 * the **run's** half is read here, from this edge's own target.
 *
 * That split is the same bargain `NodeCard` takes, and for the same reason. `canvas.edges` is
 * structure only and keeps its identity across a whole run, so folding the run into it would give
 * the array a new identity on every `node-status` line and re-sync the canvas each time. Reading
 * `incomingEdgeTone(props.target)` instead means a status line repaints exactly the edges pointing
 * at the node it names.
 *
 * `4A` coverage, Edge flow: *"the dashed 0.8 s march is a loop, not a transition, and stops the
 * moment the run ends."* Because it is a keyframe on `.active` rather than a transition, the stop
 * condition is not written anywhere — the class goes when the target stops being `running`, and
 * with it the loop.
 *
 * Reading the model means a `FieldEdge` needs a `<StudioModelProvider>` above it, exactly as a
 * `NodeCard` does — and a canvas that draws cards already has one.
 */
export const FieldEdge = reatomComponent(function FieldEdge(props: EdgeProps<FieldEdgeType>) {
  const data = props.data ?? fallback
  const tone = resolveTone(data.tone, useStudioModel().canvas.incomingEdgeTone(props.target)())
  return (
    <BaseEdge
      id={props.id}
      path={fieldEdgePath(data, {
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        targetX: props.targetX,
        targetY: props.targetY,
      })}
      className={fieldEdgeClass(tone)}
    />
  )
}, 'FieldEdge')
