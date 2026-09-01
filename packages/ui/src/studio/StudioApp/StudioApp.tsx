import type { AssetDescriptor } from '@jobik/core'
import { reatomComponent, useAction } from '@reatom/react'
import { useMemo, useState } from 'react'
import type { EdgeShape } from '#canvas/index.js'
import { FlowCanvas } from '#canvas/index.js'
import type { JobikClient } from '#client/index.js'
import { createJobikClient } from '#client/index.js'
import { CancelRunModal, SwitchFlowModal, ValidationModal } from '#modals/index.js'
import { reatomStudio, StudioModelProvider, useStudioModel } from '#model/index.js'
import { detached } from '#model/reatom.js'
import { OutputDock } from '#output/index.js'
import { RunPanel } from '#run/index.js'
import { ProblemsStrip, StatusStrip } from '#shell/index.js'
import type { ExternalModules } from '#studio/extensionLoader.js'
import { toFlowNodeSummaries, toFlowSummaries, toInventory } from '#studio/graphModel.js'
import { RunningChip, SaveConflictChip, SaveErrorChip } from '#studio/RunningChip/RunningChip.js'
import { Studio } from '#studio/Studio/Studio.js'
import s from './StudioApp.module.css'

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

/** What the body needs: the three presentational props. The rest built the model. */
type StudioAppBodyProps = Pick<StudioAppProps, 'accent' | 'edgeShape' | 'showDotGrid'>

/**
 * The Studio, driven by a live server.
 *
 * `<Studio />` (P4) is the frame, `<FlowCanvas />` (P7) the canvas, `<OutputDock />` (P12) the
 * viewer, and `<RunPanel />` (P11) the dock's body — `RunDock` draws the dock's one header
 * (`RunStateHeader.tsx`'s own doc comment says so), so this passes `RunPanel`, never the standalone
 * `RunPanelCard`, as `Studio`'s `runPanel`, and hands the run number to that one header through
 * `runMeta`. Every one of them is presentational; this component's whole job is reading
 * `packages/ui/src/model/`'s units and handing them over.
 *
 * **The array identity `FlowCanvas` syncs from is the model's to keep now.** `FlowCanvas` re-syncs
 * its internal React Flow state whenever the `nodes` or `edges` props change identity.
 * `canvas.edges` and `canvas.nodes` are `computed`s that change only when the descriptor, the
 * document, the marked node or `3D`'s marks do — no clock and no run reaches them, so a streaming
 * run never moves either array. What a run has to say about a node reaches the card that draws it,
 * which reads `canvas.nodeOverlay(id)` for itself.
 *
 * `StudioApp` builds the model and provides it; {@link StudioAppBody} consumes it. One component
 * cannot do both, and the split is the whole reason there are two.
 */
export function StudioApp(props: StudioAppProps) {
  /**
   * One model per mount, built by `useState`'s lazy initialiser.
   *
   * It runs exactly once per mounted component, which is what this needs: `reatomStudio` starts a
   * flow listing, and a model rebuilt on a later render would re-fetch, drop the draft and orphan a
   * run in flight. `props.client` and `props.baseUrl` are therefore read once — a consumer that
   * needs a different client remounts, which is what every test already does. Creating the units in
   * a component body instead would be the Reatom anti-pattern this replaces.
   */
  const [model] = useState(() =>
    reatomStudio({
      client: props.client ?? createJobikClient({ baseUrl: props.baseUrl ?? '' }),
      ...(props.externals === undefined ? {} : { externals: props.externals }),
      ...(props.importModule === undefined ? {} : { importModule: props.importModule }),
    }),
  )

  return (
    <StudioModelProvider model={model}>
      <StudioAppBody
        {...(props.accent === undefined ? {} : { accent: props.accent })}
        {...(props.edgeShape === undefined ? {} : { edgeShape: props.edgeShape })}
        {...(props.showDotGrid === undefined ? {} : { showDotGrid: props.showDotGrid })}
      />
    </StudioModelProvider>
  )
}

const StudioAppBody = reatomComponent(function StudioAppBody(props: StudioAppBodyProps) {
  const model = useStudioModel()
  const { canvas, draft, extension, flows, flowSwitch, inputs, output, run, runPanel } = model
  const { save, validation } = model

  /**
   * RTM-L01: the global `keydown` listener's lifetime is this subscription and nothing else.
   * `bound` is written by the connect hook that installs the listener, so reading it here is what
   * binds `⌘↵`, `⌘⇧V`, `⌘S` and `esc` while the Studio is on screen — and what unbinds them when it
   * leaves. A Studio nobody renders binds no global key.
   */
  model.shortcuts.bound()

  const flowId = flows.flowId()
  const descriptor = flows.descriptor()
  const uiDescriptor = extension.descriptor()
  const startId = inputs.startId()
  const selectedNodeId = inputs.selectedNodeId()
  const running = run.running()
  const saveState = save.state()
  const validated = validation.active()
  const problems = validation.problems()
  const findings = validation.findings()
  const runs = run.history()
  const activeRunId = run.activeRunId()
  const viewedReport = run.viewedReport()
  const viewerNode = output.openViewerNode()
  const dockStrings = output.dockStrings()
  // `runPanel.state` is deliberately NOT read here: it carries the run's elapsed, so it changes ten
  // times a second for the length of a run, and reading it would put the canvas and the sidebar
  // back on that clock. `RunPanel` reads it itself. `meta` and `dockStatus` are derived from the
  // run's kind and numbers instead, so neither ever sees the tick.
  const runMeta = runPanel.meta()
  const runStatus = runPanel.dockStatus()
  const switchBody = flowSwitch.body()
  const pendingFlowName = flowSwitch.pendingFlowName()

  // RTM-C02: every handler below is invoked from a DOM event, which runs outside the frame this
  // render is in. `useAction` binds each to the frame the model lives in, once.
  const requestFlow = useAction(flowSwitch.requestFlow)
  const stayOnFlow = useAction(flowSwitch.stay)
  const selectStart = useAction(inputs.selectStart)
  const selectRun = useAction(run.selectRun)
  const runFromDraft = useAction(run.runFromDraft)
  const askToCancel = useAction(run.askToCancel)
  const moveNode = useAction(draft.moveNode)
  const connectFields = useAction(draft.connect)
  const copyDraft = useAction(draft.copyDraft)
  const reloadFromDisk = useAction(flows.reloadFromDisk)
  const validate = useAction(validation.validate)
  const openReport = useAction(validation.openReport)
  const closeReport = useAction(validation.closeReport)
  // `Copy all` and `Download` are not bound here any more: `OutputHeader` reads `3A`'s two cells
  // off the model and presses `output.copyAll` / `output.download` itself, because a button's
  // state belongs to the sequence rather than to the surface that draws it.
  const closeViewer = useAction(output.close)
  const requestSave = useAction(save.save)

  /**
   * `flows`, the node rows and the inventory are held back until the descriptor has landed too.
   * Discovery and load are two units (R5), so the listing and the id settle ahead of `descriptor`,
   * and naming the flow before its own document has resolved would flash a half-loaded shell.
   *
   * They are memoised because this component re-renders on every stream frame that moves anything
   * it reads, and none of the three has anything to do with a run. It no longer re-renders on the
   * run's 100ms clock: `run.elapsedMs` is read by `RunningChip` alone, so the only thing a tick
   * moves is the chip. `runMeta` prints an elapsed too, but a settled one — the report's own number,
   * which lands once.
   */
  const flowList = flows.flows()
  const sidebar = useMemo(
    () => ({
      flows: descriptor === undefined ? [] : toFlowSummaries(flowList),
      nodes: descriptor === undefined ? [] : toFlowNodeSummaries(descriptor),
      inventory: descriptor === undefined ? [] : toInventory(descriptor),
    }),
    [descriptor, flowList],
  )

  const assetUrl = useMemo(
    () => (asset: AssetDescriptor) => model.deps.client.assetUrl(asset),
    [model],
  )

  // `FlowCanvas`'s `startNodeId` stays singular on purpose, and stays correct now that a flow may
  // declare several starts: it means "the selected entry point" — the node whose outgoing edges
  // take the accent tone — not "the flow's only start". `selectStart` is what moves it.
  const canvasSlot = (
    <div className={s.canvas}>
      <div className={s.canvasSurface}>
        <FlowCanvas
          nodes={canvas.nodes()}
          edges={canvas.edges()}
          {...(startId === undefined ? {} : { startNodeId: startId })}
          {...(selectedNodeId === undefined ? {} : { selectedNodeId })}
          {...(props.edgeShape === undefined ? {} : { edgeShape: props.edgeShape })}
          {...(props.showDotGrid === undefined ? {} : { showDotGrid: props.showDotGrid })}
          onNodeLayoutChange={moveNode}
          onConnectFields={connectFields}
          onSelectStart={selectStart}
        />
      </div>
      {viewerNode === undefined ? null : (
        <OutputDock
          nodeId={viewerNode.nodeId}
          output={{ ...(viewerNode.output ?? {}), ...viewerNode.assets }}
          {...(uiDescriptor === undefined ? {} : { descriptor: uiDescriptor })}
          assetUrl={assetUrl}
          {...(dockStrings === undefined ? {} : dockStrings)}
          raw={viewedReport}
          logs={output.logs()}
          onClose={closeViewer}
        />
      )}
    </div>
  )

  // R36: `saveState.kind === 'error'` covers every non-409 save failure — a 500, a
  // `FlowWriteError`, a transport failure — and used to render nothing, so Save silently did
  // nothing visible while the user believed the file was written. No artboard draws this state
  // (checked against `Jobik Studio.dc.html`), so it reuses `SaveConflictChip`'s exact chrome and
  // shows `.error.message` verbatim — the server's own words, never re-humanised.
  const runningChip =
    saveState.kind === 'conflict' ? (
      <SaveConflictChip onReload={reloadFromDisk} onCopyDraft={copyDraft} />
    ) : saveState.kind === 'error' ? (
      <SaveErrorChip message={saveState.error.message} />
    ) : running && startId !== undefined ? (
      <RunningChip startId={startId} onCancel={askToCancel} />
    ) : undefined

  /**
   * `3D` §3D.3 — the strip that replaces the bottom edge of the shell once a check has answered.
   * Absent before that, which is what every other artboard draws.
   *
   * `2 nodes · 2 connections` is the descriptor and the document; `checked <n> s ago` counts from
   * the moment the answer landed. Nothing here is a fixture.
   */
  const document = draft.document()
  const statusStrip =
    validated?.kind === 'valid' && descriptor !== undefined && document !== undefined ? (
      <StatusStrip
        nodeCount={descriptor.nodes.length}
        connectionCount={document.connections.length}
        checkedAt={validated.checkedAt}
      />
    ) : validated?.kind === 'invalid' && problems.problems.length > 0 ? (
      <ProblemsStrip problems={problems.problems} onOpenReport={openReport} />
    ) : undefined

  return (
    <>
      <Studio
        {...(props.accent === undefined ? {} : { accent: props.accent })}
        flows={sidebar.flows}
        {...(descriptor !== undefined && flowId !== undefined ? { activeFlowId: flowId } : {})}
        onSelectFlow={requestFlow}
        {...(descriptor === undefined ? {} : { flowFile: descriptor.sourceFile })}
        dirty={draft.dirty()}
        nodes={sidebar.nodes}
        {...(selectedNodeId === undefined ? {} : { selectedNodeId })}
        onSelectStart={selectStart}
        inventory={sidebar.inventory}
        {...(startId === undefined ? {} : { entryNodeId: startId })}
        running={running}
        {...(runningChip === undefined ? {} : { runningChip })}
        canvas={canvasSlot}
        runPanel={<RunPanel />}
        {...(runMeta === undefined ? {} : { runMeta: runMeta.text, runMetaTone: runMeta.tone })}
        {...(runStatus === undefined ? {} : { runStatus })}
        {...(runs.length === 0
          ? {}
          : {
              runs,
              ...(activeRunId === undefined ? {} : { selectedRunId: activeRunId }),
              // While a run streams, the canvas and the panel belong to it: it has no row of its
              // own yet, so a row that took the surfaces over would strand the user with no way
              // back to the run actually happening. Without `onSelectRun` the sidebar draws the
              // plain read-only listing every artboard shows, which is exactly right for that.
              ...(running ? {} : { onSelectRun: selectRun }),
            })}
        validate={validation.topBar()}
        runBlocked={validation.blocked()}
        {...(statusStrip === undefined ? {} : { status: statusStrip })}
        onValidate={validate}
        onOpenReport={openReport}
        onSave={() => detached(requestSave())}
        onRun={runFromDraft}
      />
      {/*
        `3C`'s `Validation`. It opens only on a rejected document: the wire answers
        `{ valid: true }` with no findings, and no artboard draws an all-clear dialog, so a passing
        check stays as quiet as it was before. Its context line is `publication · flow.ts` — the
        module the flow is authored in, the same badge the top bar shows, and the file `3C`'s own
        findings cite.
      */}
      {validation.reportOpen() && findings !== undefined ? (
        <ValidationModal
          context={`${descriptor?.name ?? ''} · ${descriptor?.sourceFile ?? ''}`}
          findings={findings}
          onRevalidate={validate}
          onDismiss={closeReport}
        />
      ) : null}
      {/*
        `3C`'s `Cancel run #219?`. Destructive, so a backdrop click does not dismiss it — only
        `esc`, `Keep running`, or the cancel itself.

        It is rendered unconditionally because the dialog owns its own guard now: it reads
        `cancelPrompt`, `running` and `session` itself and draws nothing until all three say so.
        That is what took `run.session` — which the stream replaces on every line — out of this
        component's dependencies.
      */}
      <CancelRunModal />
      {/*
        `3F`'s `Switch to <flow>?`. Destructive for the same reason `Cancel run` is: both of its
        ghosts give something up, so a stray backdrop click must not stand in for one. `esc` is the
        third action, and the footer hint names the flow it keeps.

        `body` is the shape the dialog wants, and reading it is also what arms `3F`'s
        self-answering switch — see `model/flowSwitch.ts`.
      */}
      {switchBody === undefined || pendingFlowName === undefined ? null : (
        <SwitchFlowModal
          currentFlowName={descriptor?.name ?? flowId ?? ''}
          targetFlowName={pendingFlowName}
          body={switchBody}
          onDismiss={stayOnFlow}
        />
      )}
    </>
  )
}, 'StudioAppBody')
