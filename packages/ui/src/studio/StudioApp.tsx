import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EdgeShape } from '../canvas/index.js'
import { FlowCanvas } from '../canvas/index.js'
import type { JobikClient } from '../client/index.js'
import { createJobikClient } from '../client/index.js'
import { OutputViewer, resolveOutputComponent } from '../output/index.js'
import type { RunOutputField, RunPanelState } from '../run/index.js'
import { RunPanel, validateRunInputs } from '../run/index.js'
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
import { RunningChip, SaveConflictChip, SaveErrorChip } from './RunningChip.js'
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
 * `<Studio />` (P4) is the frame, `<FlowCanvas />` (P7) the canvas, `<OutputViewer />` (P12) the
 * viewer, and `<RunPanel />` (P11) the dock's body — `RunDock` already draws the dock's one header
 * (`RunStateHeader.tsx`'s own doc comment says so), so this passes `RunPanel`, never the standalone
 * `RunPanelCard`, as `Studio`'s `runPanel`. Every one of them is presentational and untouched; this
 * component's whole job is turning `useStudioSession`'s state into their props.
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

// R38: `Run panel — states`, the running card's own note. `IDLE_NOTE` above has its counterpart;
// this one was simply never wired up.
const RUNNING_NOTE =
  'Streaming output as each node settles. Inputs are locked for the duration of the run.'

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
  const closeViewer = useCallback(() => setViewerNodeId(undefined), [])

  const { descriptor, draft, session, running, extension, assetUrl } = studio
  const document = draft?.document

  const startNode = useMemo(
    () => descriptor?.nodes.find((node) => node.id === studio.startId),
    [descriptor, studio.startId],
  )

  // R7: `Cmd/Ctrl+Enter`, the docked run button (which the top bar also renders once the dock is
  // collapsed) and a failed panel's `Re-run` all fire the run with whatever the input draft
  // currently holds — never a fresh, empty input. One local, three call sites, so none of them can
  // drift from the other two.
  //
  // R35: this used to hand-roll collection as `Object.entries(draft).filter(v !== '')`, which can
  // only ever produce strings — a `number` field crossed the wire as `"1024"`, a `json` field as its
  // raw unparsed text, a `literal` as `String(value)`, and an unconnected `asset` field was not
  // dropped at all. `RunIdleView`'s own Run button was already correct because it calls the merged
  // `validateRunInputs` (`packages/ui/src/run/validate.ts`); these three sites now route through the
  // exact same helper, so a run started from any of the five affordances sends the same values.
  const runInputValues = useCallback((): Record<string, unknown> | undefined => {
    if (startNode === undefined) return undefined
    const values = validateRunInputs({
      input: toRunInputSchema(startNode.input),
      fields: startNode.input.fields,
      draft: studio.inputDraft,
    })
    // No panel is shown at any of these three call sites to render a `z.ZodError` or `SyntaxError`
    // in — `RunIdleView`'s own control is the only place `onInvalid` has anywhere to go — so an
    // invalid draft here simply does not start a run, exactly as an unwired invalid draft did
    // before this fix.
    return values instanceof Error ? undefined : values
  }, [startNode, studio.inputDraft])

  // Every run start closes whatever output the viewer still has open. Without this, the viewer
  // only appears to close because `lastReport` goes briefly `undefined`; if the next report
  // contains a node with the same id as `viewerNodeId`, it silently reopens with no user action.
  const startRun = useCallback(
    (values: Record<string, unknown>) => {
      closeViewer()
      studio.run(values)
    },
    [studio.run, closeViewer],
  )

  // R35: the one place `runInputValues()`'s result is actually turned into a run. Used by the
  // top-bar/docked Run control, `⌘↵` and a failed panel's `Re-run` — never by `RunIdleView`'s own
  // button, which already calls `startRun` with `validateRunInputs`'s own result directly.
  const runFromDraft = useCallback(() => {
    const values = runInputValues()
    if (values !== undefined) startRun(values)
  }, [runInputValues, startRun])

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
    // (the striped placeholder).
    //
    // R37: `field.field` can be QUALIFIED (`render.image`) whenever two nodes share a field name, so
    // recovering the owning node by searching `node.assets` for that (possibly qualified) label —
    // as this used to do — silently fails whenever qualification actually fires, and `Open` does
    // nothing. `onOpenAsset` is called from inside `toOutputFields`'s own per-node loop, which
    // already has the real `node.nodeId` in hand and never has to guess it back out of a label.
    return toOutputFields({
      nodes: report.nodes,
      onOpenAsset: (nodeId) => () => setViewerNodeId(nodeId),
    })
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
        note: RUNNING_NOTE,
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
        onRerun: runFromDraft,
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
      onRun: startRun,
      ...(studio.lastReport === undefined ? {} : { lastRun: toRunSummary(studio.lastReport) }),
    }
    // Depend on the specific `studio` fields this memo actually reads, not on `studio` itself —
    // `useStudioSession` returns a fresh object every render, so depending on it defeats the memo
    // on every 100ms elapsed-time tick while a run is in flight.
  }, [
    descriptor,
    startNode,
    running,
    session,
    studio.startId,
    studio.elapsedMs,
    studio.cancel,
    studio.lastReport,
    studio.inputDraft,
    studio.setInputField,
    startRun,
    outputs,
    runFromDraft,
  ])

  // `### Run panel`: P11 renders `⌘↵` and `esc` and binds neither.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        if (!running && startNode !== undefined) {
          runFromDraft()
        }
        return
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        studio.save()
        return
      }
      if (event.key === 'Escape') {
        // R33: the `Output viewer` artboard (design lines 484–491) draws `Copy all` / `Download`
        // and no close control of its own. `Escape` is the least-invented way to keep it
        // closable without inventing a button the design does not have; it takes priority over
        // cancelling a run, since the viewer only ever opens once a run has already settled.
        if (viewerNodeId !== undefined) {
          closeViewer()
          return
        }
        if (running) studio.cancel()
      }
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [running, startNode, studio.save, studio.cancel, runFromDraft, viewerNodeId, closeViewer])

  const openViewerNode = useMemo(
    () => studio.lastReport?.nodes.find((node) => node.nodeId === viewerNodeId),
    [studio.lastReport, viewerNodeId],
  )

  const onNodeLayoutChange = studio.moveNode
  const onConnectFields = studio.connect

  const viewerLogs = useMemo(
    () =>
      session === undefined
        ? []
        : toRunLog(session).lines.map((line) => ({ time: line.time, message: line.text })),
    [session],
  )

  // R33: `Copy all` and `Download` were both wired to `closeViewer` — neither did what it said,
  // and closing the viewer required pressing a button labelled "Copy all". Both now act on the
  // same payload the `Raw` tab already renders (`raw={studio.lastReport}` below).
  const onCopyAllOutput = useCallback(() => {
    if (studio.lastReport === undefined) return
    void globalThis.navigator?.clipboard?.writeText(JSON.stringify(studio.lastReport, null, 2))
  }, [studio.lastReport])

  const onDownloadOutput = useCallback(() => {
    if (studio.lastReport === undefined || openViewerNode === undefined) return
    try {
      const blob = new Blob([JSON.stringify(studio.lastReport, null, 2)], {
        type: 'application/json',
      })
      const url = globalThis.URL.createObjectURL(blob)
      const link = globalThis.document.createElement('a')
      link.href = url
      link.download = `${openViewerNode.nodeId}-run-${studio.lastReport.runNumber}.json`
      link.click()
      globalThis.URL.revokeObjectURL(url)
    } catch {
      // No Blob/URL.createObjectURL support in this environment. `Copy all` is the fallback;
      // there is nothing more useful to do client-side.
    }
  }, [studio.lastReport, openViewerNode])

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
            onCopyAll={onCopyAllOutput}
            onDownload={onDownloadOutput}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  )

  // R36: `saveState.kind === 'error'` covers every non-409 save failure — a 500, a
  // `FlowWriteError`, a transport failure — and used to render nothing, so Save silently did
  // nothing visible while the user believed the file was written. No artboard draws this state
  // (checked against `Jobik Studio.dc.html`), so it reuses `SaveConflictChip`'s exact chrome and
  // shows `.error.message` verbatim — the server's own words, never re-humanised.
  const runningChip =
    studio.saveState.kind === 'conflict' ? (
      <SaveConflictChip onReload={studio.reloadFromDisk} onCopyDraft={studio.copyDraft} />
    ) : studio.saveState.kind === 'error' ? (
      <SaveErrorChip message={studio.saveState.error.message} />
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

  // These three were being rebuilt inline in JSX on every render, including every 100ms
  // elapsed-time tick while a run is in flight — `descriptor` and `studio.flows` are the only
  // inputs that actually change their output.
  const flowSummaries = useMemo(
    () => (loaded ? toFlowSummaries(studio.flows) : []),
    [loaded, studio.flows],
  )
  const flowNodeSummaries = useMemo(
    () => (descriptor === undefined ? [] : toFlowNodeSummaries(descriptor)),
    [descriptor],
  )
  const inventory = useMemo(
    () => (descriptor === undefined ? [] : toInventory(descriptor)),
    [descriptor],
  )

  return (
    <Studio
      {...(props.accent === undefined ? {} : { accent: props.accent })}
      flows={flowSummaries}
      {...(loaded && studio.flowId !== undefined ? { activeFlowId: studio.flowId } : {})}
      {...(descriptor === undefined ? {} : { flowFile: descriptor.documentFile })}
      dirty={draft?.dirty ?? false}
      nodes={flowNodeSummaries}
      {...(studio.selectedNodeId === undefined ? {} : { selectedNodeId: studio.selectedNodeId })}
      inventory={inventory}
      {...(studio.startId === undefined ? {} : { entryNodeId: studio.startId })}
      running={running}
      {...(runningChip === undefined ? {} : { runningChip })}
      canvas={canvas}
      {...(runPanelState === undefined ? {} : { runPanel: <RunPanel state={runPanelState} /> })}
      onValidate={studio.validate}
      onSave={studio.save}
      onRun={runFromDraft}
    />
  )
}
