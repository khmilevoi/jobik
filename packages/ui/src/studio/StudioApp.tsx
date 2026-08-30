import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EdgeShape } from '../canvas/index.js'
import { FlowCanvas } from '../canvas/index.js'
import type { JobikClient } from '../client/index.js'
import { createJobikClient } from '../client/index.js'
import { OutputViewer, resolveOutputComponent } from '../output/index.js'
import type { RunOutputField, RunPanelState } from '../run/index.js'
import { RunPanelCard } from '../run/index.js'
import { surfaces } from '../tokens.js'
import { toOutputFields } from './assets.js'
import type { ExternalModules } from './extensionLoader.js'
import { formatElapsed } from './format.js'
import type { NodeOverlay } from './graphModel.js'
import {
  toCanvasEdges,
  toCanvasNodes,
  toFlowNodeSummaries,
  toFlowSummaries,
  toInventory,
} from './graphModel.js'
import { runInputPresentation, toRunInputSchema } from './inputSchema.js'
import { RunningChip, SaveConflictChip } from './RunningChip.js'
import {
  toNodeOverlays,
  toRunErrorDetail,
  toRunLog,
  toRunNodeTimings,
  toRunStack,
  toRunSummary,
} from './runPresenter.js'
import { completedNodeCount } from './runSession.js'
import { Studio } from './Studio.js'
import { useStudioSession } from './useStudioSession.js'

/**
 * The Studio, driven by a live server.
 *
 * `<Studio />` (P4) is the frame, `<FlowCanvas />` (P7) the canvas, `<RunPanelCard />` (P11) the
 * dock and `<OutputViewer />` (P12) the viewer. Every one of them is presentational and untouched;
 * this component's whole job is turning `useStudioSession`'s state into their props.
 *
 * **`nodes` and `edges` are memoised.** `FlowCanvas` syncs its internal state from prop ARRAY
 * IDENTITY, so rebuilding either array on every render silently resets an in-flight drag and
 * reverts selection. See `packages/ui/src/canvas/types.ts`.
 */

export interface StudioAppProps {
  /** Supply one in tests. In the browser the default same-origin client is right. */
  readonly client?: JobikClient
  readonly baseUrl?: string
  /** The live module namespaces a flow-local `flow.ui.tsx` bundle may import. */
  readonly externals?: ExternalModules
  readonly importModule?: (url: string) => Promise<unknown>
  readonly accent?: string
  readonly edgeShape?: EdgeShape
  readonly showDotGrid?: boolean
}

const IDLE_NOTE =
  'Inputs are typed from the flow declaration. Only downstream nodes of the selected entry point run.'

export function StudioApp(props: StudioAppProps) {
  const client = useMemo(
    () => props.client ?? createJobikClient({ baseUrl: props.baseUrl ?? '' }),
    [props.client, props.baseUrl],
  )

  const studio = useStudioSession({
    client,
    ...(props.externals === undefined ? {} : { externals: props.externals }),
    ...(props.importModule === undefined ? {} : { importModule: props.importModule }),
  })

  const [viewerNodeId, setViewerNodeId] = useState<string | undefined>(undefined)

  const { descriptor, draft, session, running, extension, assetUrl } = studio
  const document = draft?.document

  const startNode = useMemo(
    () => descriptor?.nodes.find((node) => node.id === studio.startId),
    [descriptor, studio.startId],
  )

  // R7: `Cmd/Ctrl+Enter`, the docked run button and a failed panel's `Re-run` all fire the run with
  // whatever the input draft currently holds — never a fresh, empty input. One local, three call
  // sites, so none of them can drift from the other two.
  const runInputValues = useCallback(
    () => Object.fromEntries(Object.entries(studio.inputDraft).filter(([, value]) => value !== '')),
    [studio.inputDraft],
  )

  const overlays = useMemo<ReadonlyMap<string, NodeOverlay> | undefined>(() => {
    if (session === undefined) return undefined

    const base = toNodeOverlays(session)
    const enriched = new Map<string, NodeOverlay>()

    for (const [nodeId, overlay] of base) {
      const report = session.report?.nodes.find((node) => node.nodeId === nodeId)
      if (overlay.state !== 'ok' || report === null || report === undefined) {
        enriched.set(nodeId, overlay)
        continue
      }

      // `## Flow-local output UI`: the registered component fills the inline slot; an absent one
      // falls back to the generic JSON viewer. P12's resolver already encodes that fallback.
      const Output = resolveOutputComponent(extension, nodeId)
      enriched.set(nodeId, {
        ...overlay,
        outputSlot: {
          content: (
            <Output
              nodeId={nodeId}
              output={{ ...(report.output ?? {}), ...report.assets }}
              surface="card"
              assetUrl={assetUrl}
            />
          ),
        },
      })
    }

    return enriched
  }, [session, extension, assetUrl])

  // Ruling 1: keyed on the model INPUTS (descriptor, document, selection, overlays), never on the
  // previous `nodes`/`edges` output. `FlowCanvas` syncs from these two arrays by identity alone.
  const nodes = useMemo(() => {
    if (descriptor === undefined || document === undefined) return []
    return toCanvasNodes({
      descriptor,
      document,
      ...(studio.selectedNodeId === undefined ? {} : { selectedNodeId: studio.selectedNodeId }),
      ...(overlays === undefined ? {} : { overlays }),
    })
  }, [descriptor, document, studio.selectedNodeId, overlays])

  const edges = useMemo(() => (document === undefined ? [] : toCanvasEdges(document)), [document])

  const outputs = useMemo<readonly RunOutputField[]>(() => {
    const report = studio.lastReport
    if (report === undefined) return []
    // R2: `toOutputFields` takes no `assetUrl` — it never built one. `thumbnail` stays `undefined`
    // (the striped placeholder); only `onOpen` is filled here.
    return toOutputFields({ nodes: report.nodes }).map((field) =>
      field.kind === 'asset'
        ? {
            ...field,
            onOpen: () =>
              setViewerNodeId(report.nodes.find((node) => field.field in node.assets)?.nodeId),
          }
        : field,
    )
  }, [studio.lastReport])

  const runPanelState = useMemo<RunPanelState | undefined>(() => {
    if (descriptor === undefined || startNode === undefined || studio.startId === undefined) {
      return undefined
    }
    const order = descriptor.nodes.map((node) => node.id)

    if (running && session !== undefined) {
      const total = session.nodeCount > 0 ? session.nodeCount : order.length
      const completed = completedNodeCount(session)
      return {
        kind: 'running',
        runNumber: session.runNumber ?? 0,
        elapsed: formatElapsed(studio.elapsedMs),
        completedNodes: completed,
        totalNodes: total,
        progress: total > 0 ? completed / total : 0,
        nodes: toRunNodeTimings(session, order),
        log: toRunLog(session),
        partialOutput: true,
        onCancel: studio.cancel,
      }
    }

    // R9: guarded on `session !== undefined` rather than fabricated. A settled run — streamed or
    // rejected outright — always leaves `session` populated by the time `running` goes back to
    // `false`; nothing here invents a `RunSession` shape to satisfy the compiler.
    if (
      session !== undefined &&
      (session.failure !== undefined || session.report?.status !== 'ok')
    ) {
      const error = toRunErrorDetail(session)
      const payload =
        session.failure ??
        session.report?.error ??
        [...session.nodes.values()].find((node) => node.error !== null)?.error ??
        undefined
      const stack = payload === undefined ? undefined : toRunStack(payload)
      return {
        kind: 'failed',
        runNumber: session.runNumber ?? 0,
        elapsed: formatElapsed(session.report?.elapsedMs ?? 0),
        error,
        nodes: toRunNodeTimings(session, order),
        ...(stack === undefined ? {} : { stack }),
        onCopyLog: () => {
          void globalThis.navigator?.clipboard?.writeText(
            toRunLog(session)
              .lines.map((line) => `${line.time} ${line.text}`)
              .join('\n'),
          )
        },
        onRerun: () => studio.run(runInputValues()),
      }
    }

    if (
      studio.lastReport !== undefined &&
      studio.lastReport.status === 'ok' &&
      session !== undefined
    ) {
      return {
        kind: 'completed',
        runNumber: studio.lastReport.runNumber,
        elapsed: formatElapsed(studio.lastReport.elapsedMs),
        nodes: toRunNodeTimings(session, order),
        outputs,
      }
    }

    return {
      kind: 'idle',
      entryNodeId: studio.startId,
      note: IDLE_NOTE,
      descriptor: startNode.input,
      input: toRunInputSchema(startNode.input),
      draft: studio.inputDraft,
      presentation: runInputPresentation(startNode.input, studio.inputDraft),
      onDraftChange: studio.setInputField,
      onRun: studio.run,
      ...(studio.lastReport === undefined ? {} : { lastRun: toRunSummary(studio.lastReport) }),
    }
  }, [descriptor, startNode, running, session, studio, outputs, runInputValues])

  // `### Run panel`: P11 renders `⌘↵` and `esc` and binds neither.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        if (!running && startNode !== undefined) {
          studio.run(runInputValues())
        }
        return
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        studio.save()
        return
      }
      if (event.key === 'Escape' && running) studio.cancel()
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [running, startNode, studio, runInputValues])

  const openViewerNode = useMemo(
    () => studio.lastReport?.nodes.find((node) => node.nodeId === viewerNodeId),
    [studio.lastReport, viewerNodeId],
  )

  const onNodeLayoutChange = studio.moveNode
  const onConnectFields = studio.connect
  const closeViewer = useCallback(() => setViewerNodeId(undefined), [])

  const viewerLogs = useMemo(
    () =>
      session === undefined
        ? []
        : toRunLog(session).lines.map((line) => ({ time: line.time, message: line.text })),
    [session],
  )

  const canvas = (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex' }}>
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        {...(studio.startId === undefined ? {} : { startNodeId: studio.startId })}
        {...(studio.selectedNodeId === undefined ? {} : { selectedNodeId: studio.selectedNodeId })}
        {...(props.edgeShape === undefined ? {} : { edgeShape: props.edgeShape })}
        {...(props.showDotGrid === undefined ? {} : { showDotGrid: props.showDotGrid })}
        onNodeLayoutChange={onNodeLayoutChange}
        onConnectFields={onConnectFields}
      />
      {openViewerNode === undefined ? null : (
        // R6: `surfaces.appShell` does not exist. The backdrop reuses `surfaces.shell` — the same
        // token merged `StudioFrame.tsx` already draws the app shell in; the viewer card's own
        // `surfaces.panel` background comes from `OutputViewer` itself.
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: surfaces.shell,
            display: 'flex',
          }}
        >
          <OutputViewer
            nodeId={openViewerNode.nodeId}
            output={{ ...(openViewerNode.output ?? {}), ...openViewerNode.assets }}
            {...(extension === undefined ? {} : { descriptor: extension })}
            assetUrl={assetUrl}
            raw={studio.lastReport}
            logs={viewerLogs}
            onCopyAll={closeViewer}
            onDownload={closeViewer}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  )

  const runningChip =
    studio.saveState.kind === 'conflict' ? (
      <SaveConflictChip onReload={studio.reloadFromDisk} onCopyDraft={studio.copyDraft} />
    ) : running && studio.startId !== undefined ? (
      <RunningChip
        startId={studio.startId}
        elapsed={formatElapsed(studio.elapsedMs)}
        onCancel={studio.cancel}
      />
    ) : undefined

  // `flows`/`activeFlowId` are held back until the descriptor has landed too. Discovery and load
  // are two separate effects (R5), so `studio.flows`/`studio.flowId` settle a render ahead of
  // `descriptor` — showing the flow's name before its own document file has resolved would flash a
  // half-loaded top bar and sidebar rather than the two becoming true together.
  const loaded = descriptor !== undefined

  return (
    <Studio
      {...(props.accent === undefined ? {} : { accent: props.accent })}
      flows={loaded ? toFlowSummaries(studio.flows) : []}
      {...(loaded && studio.flowId !== undefined ? { activeFlowId: studio.flowId } : {})}
      {...(descriptor === undefined ? {} : { flowFile: descriptor.documentFile })}
      dirty={draft?.dirty ?? false}
      nodes={descriptor === undefined ? [] : toFlowNodeSummaries(descriptor)}
      {...(studio.selectedNodeId === undefined ? {} : { selectedNodeId: studio.selectedNodeId })}
      inventory={descriptor === undefined ? [] : toInventory(descriptor)}
      {...(studio.startId === undefined ? {} : { entryNodeId: studio.startId })}
      running={running}
      {...(runningChip === undefined ? {} : { runningChip })}
      canvas={canvas}
      {...(runPanelState === undefined || studio.startId === undefined
        ? {}
        : { runPanel: <RunPanelCard state={runPanelState} entryNodeId={studio.startId} /> })}
      onValidate={studio.validate}
      onSave={studio.save}
      onRun={() => studio.run(runInputValues())}
    />
  )
}
