import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EdgeShape } from '#canvas/index.js'
import { FlowCanvas, MetadataRow } from '#canvas/index.js'
import type { JobikClient } from '#client/index.js'
import { createJobikClient } from '#client/index.js'
import type { SwitchFlowBody } from '#modals/index.js'
import { CancelRunModal, SwitchFlowModal, ValidationModal } from '#modals/index.js'
import { OutputDock, resolveOutputComponent } from '#output/index.js'
import { useValidateAction } from '#primitives/index.js'
import type { RunPanelState } from '#run/index.js'
import { assetMetaParts, formatRunMeta, RunPanel, validateRunInputs } from '#run/index.js'
import type {
  RunDockMetaTone,
  RunDockStatus,
  RunHistoryEntry,
  TopBarValidateState,
} from '#shell/index.js'
import { ProblemsStrip, StatusStrip } from '#shell/index.js'
import { unsavedChangeCount } from '#studio/draft.js'
import type { ExternalModules } from '#studio/extensionLoader.js'
import { formatElapsed, formatOutputContext, formatOutputSummary } from '#studio/format.js'
import type { NodeOverlay } from '#studio/graphModel.js'
import {
  toCanvasEdges,
  toCanvasNodes,
  toFlowNodeSummaries,
  toFlowSummaries,
  toInventory,
  waitingOnField,
} from '#studio/graphModel.js'
import { runInputPresentation, toRunInputSchema } from '#studio/inputSchema.js'
import { NO_PROBLEMS, toFlowProblems } from '#studio/problems.js'
import { RunningChip, SaveConflictChip, SaveErrorChip } from '#studio/RunningChip/RunningChip.js'
import {
  toNodeOverlays,
  toRunErrorDetail,
  toRunLog,
  toRunNodeTimings,
  toRunStack,
  toRunSummary,
} from '#studio/runPresenter.js'
import { completedNodeCount } from '#studio/runSession.js'
import { Studio } from '#studio/Studio/Studio.js'
import { useStudioSession } from '#studio/useStudioSession.js'
import { toValidationFindings } from '#studio/validation.js'
import s from './StudioApp.module.css'

/**
 * The Studio, driven by a live server.
 *
 * `<Studio />` (P4) is the frame, `<FlowCanvas />` (P7) the canvas, `<OutputViewer />` (P12) the
 * viewer, and `<RunPanel />` (P11) the dock's body — `RunDock` draws the dock's one header
 * (`RunStateHeader.tsx`'s own doc comment says so), so this passes `RunPanel`, never the standalone
 * `RunPanelCard`, as `Studio`'s `runPanel`, and hands the run number to that one header through
 * `runMeta`. Every one of them is presentational and untouched; this component's whole job is
 * turning `useStudioSession`'s state into their props.
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

  /**
   * `2A`'s `Run history` — `#221 2.4s`, `#220 failed`, `#219 2.4s` — from the runs this browser
   * session has actually made.
   *
   * It is a record, not a navigator: **no row carries an `onSelectRun`**, because v1 has no
   * endpoint that returns an earlier run's report and nothing client-side keeps one. Restoring
   * `#219` would mean re-deriving the canvas overlays, the run panel and the dock from a report the
   * app no longer has. Every value shown is real — the server's own run number, the status it
   * settled with, and its elapsed — and the selected row is the run currently on screen.
   */
  const [runHistory, setRunHistory] = useState<readonly RunHistoryEntry[]>([])

  /**
   * `3C`: cancelling asks first. Every affordance that used to call `cancel()` — the run panel's
   * `Cancel run`, the running chip's `Cancel`, and `Escape` — now opens `Cancel run #219?`, and the
   * dialog's own destructive primary is the only thing that actually cancels.
   */
  const [cancelPrompt, setCancelPrompt] = useState(false)
  const askToCancel = useCallback(() => setCancelPrompt(true), [])
  const keepRunning = useCallback(() => setCancelPrompt(false), [])

  /**
   * `3F`: switching flows asks first too, whenever the switch would lose something. The flow whose
   * row was pressed is held here while the dialog stands; `undefined` is the whole of "no dialog",
   * the same way `cancelPrompt` above is.
   *
   * `saveAndSwitchTo` is the one answer that cannot be given synchronously. `Save and switch` must
   * complete the write before it leaves — and must not leave at all if the write is rejected — and
   * `studio.save()` is fire-and-forget, so the target is parked here and the effect below reads the
   * outcome off `saveState`, which is where the hook already models it.
   */
  const [pendingFlowId, setPendingFlowId] = useState<string | undefined>(undefined)
  const [saveAndSwitchTo, setSaveAndSwitchTo] = useState<string | undefined>(undefined)

  const { descriptor, draft, session, running, extension, assetUrl } = studio
  const document = draft?.document
  const validation = studio.validation

  /**
   * `3D`, from the one finding the wire carries. `toFlowProblems` is where the honesty lives: the
   * strip's rows, the node and port marks and the failing edge all come out of the server's own
   * answer and the document, and everything the wire cannot say — a second finding, a severity, a
   * `flow.ts:41` — is simply absent rather than invented.
   */
  const problems = useMemo(() => {
    if (validation?.kind !== 'invalid' || document === undefined) return NO_PROBLEMS
    return toFlowProblems({ error: validation.error, document })
  }, [validation, document])

  const errorCount = useMemo(
    () => problems.problems.filter((problem) => problem.severity === 'error').length,
    [problems],
  )

  /**
   * `3D`'s invalid-board caption, which the design states in prose and draws nowhere: *"Run is
   * disabled while any error stands; warnings never block it."* Counted off the findings rather
   * than off `validation.kind`, so the day the wire learns to send a warning it will not block a
   * run by accident.
   */
  const runBlocked = errorCount > 0

  /**
   * The `idle → checking → valid|invalid → idle` sequence, with `3D`'s 4 s hold on the resolved
   * chip. Only the chip returns to idle on that timer — the findings themselves persist until the
   * flow changes, which `useStudioSession` owns.
   */
  const validateAction = useValidateAction()
  const validatePress = validateAction.press
  const validateSettle = validateAction.settle
  const validateReset = validateAction.reset

  const requestValidate = useCallback(() => {
    // §3D.4's own `if (this.state[key] !== 'idle') return`: a press while the check runs, or while
    // a result still stands, does nothing at all.
    if (running || !validatePress()) return
    studio.validate()
  }, [running, validatePress, studio.validate])

  // The design's `later(1200, …)` is how the artboard fakes a round trip; here the server ends the
  // checking phase whenever it actually answers. `unreachable` resolves to nothing: the check
  // never ran, so there is no result to hold.
  useEffect(() => {
    if (validation === undefined || validation.kind === 'unreachable') {
      validateReset()
      return
    }
    if (validation.kind === 'valid') validateSettle('valid')
    if (validation.kind === 'invalid') validateSettle('invalid')
  }, [validation, validateSettle, validateReset])

  /**
   * `3C`'s Validation dialog, as a surface of its own rather than as the validation state itself.
   * `3D` makes the findings outlive the dialog — the strip and the canvas marks stand until the
   * flow changes — so dismissing the dialog must not throw the result away, which is what wiring
   * `onDismiss` to `dismissValidation` used to do.
   */
  const [reportOpen, setReportOpen] = useState(false)
  const openReport = useCallback(() => setReportOpen(true), [])
  const closeReport = useCallback(() => setReportOpen(false), [])
  useEffect(() => setReportOpen(validation?.kind === 'invalid'), [validation])

  const startNode = useMemo(
    () => descriptor?.nodes.find((node) => node.id === studio.startId),
    [descriptor, studio.startId],
  )

  /**
   * Switching flows, and the four pieces of state that are `StudioApp`'s rather than the hook's.
   *
   * Written here, synchronously, in the same event as the hook's own reset — not in an effect
   * keyed on `flowId`, because an effect commits a frame later and that frame paints flow `#1`'s
   * run history, open output and validate chip under flow `#2`'s name. React batches the whole
   * click into one commit instead.
   *
   * `reportOpen` needs no line of its own: it is driven by an effect on `validation`, which
   * `selectFlow` clears unconditionally.
   */
  const switchTo = useCallback(
    (nextFlowId: string) => {
      setViewerNodeId(undefined)
      setRunHistory([])
      setCancelPrompt(false)
      setPendingFlowId(undefined)
      setSaveAndSwitchTo(undefined)
      validateReset()
      studio.selectFlow(nextFlowId)
    },
    [studio.selectFlow, validateReset],
  )

  /**
   * `3F` — the guard, and the reason it lives here rather than in `useStudioSession`.
   *
   * The hook's `selectFlow` is the *transition*: it resets every per-flow field and ref
   * synchronously so no frame paints one flow's state under another's id, and its doc comment is
   * explicit that it is "immediate and never blocked". Asking a question first is not a second
   * kind of transition, it is a surface — a modal, held-back state, and an answer — and every
   * other confirmation in the Studio (`cancelPrompt` above) is already owned here. Keeping the
   * hook unconditional also means the two cannot disagree about what a switch resets.
   *
   * A clean draft with no run in flight loses nothing, so it goes straight through: the common
   * case never sees a dialog.
   */
  const selectFlow = useCallback(
    (nextFlowId: string) => {
      if (nextFlowId === studio.flowId) return
      if (running || draft?.dirty === true) {
        setPendingFlowId(nextFlowId)
        return
      }
      switchTo(nextFlowId)
    },
    [studio.flowId, running, draft?.dirty, switchTo],
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
      // `3D`: no affordance starts a run while an error stands. The docked control and the run
      // chip also *look* blocked (`runBlocked` below); this is the guard behind all of them,
      // including `RunIdleView`'s own button, whose chrome `run/` owns.
      if (runBlocked) return
      closeViewer()
      studio.run(values)
    },
    [studio.run, closeViewer, runBlocked],
  )

  // R35: the one place `runInputValues()`'s result is actually turned into a run. Used by the
  // top-bar/docked Run control, `⌘↵` and a failed panel's `Re-run` — never by `RunIdleView`'s own
  // button, which already calls `startRun` with `validateRunInputs`'s own result directly.
  const runFromDraft = useCallback(() => {
    const values = runInputValues()
    if (values !== undefined) startRun(values)
  }, [runInputValues, startRun])

  // Append each run to the history as it settles, newest first, exactly once per run number.
  const settledReport = session?.report
  useEffect(() => {
    if (settledReport === undefined) return
    setRunHistory((previous) => {
      const id = String(settledReport.runNumber)
      if (previous.some((entry) => entry.id === id)) return previous
      return [
        {
          id,
          label: `#${settledReport.runNumber}`,
          status: settledReport.status === 'ok' ? 'ok' : 'failed',
          ...(settledReport.status === 'ok'
            ? { elapsed: formatElapsed(settledReport.elapsedMs) }
            : {}),
        },
        ...previous,
      ]
    })
  }, [settledReport])

  const overlays = useMemo<ReadonlyMap<string, NodeOverlay> | undefined>(() => {
    if (session === undefined) return undefined

    const base = toNodeOverlays(session)
    const enriched = new Map<string, NodeOverlay>()
    // Closeout finding 1, queued: a node is blocked on an upstream that has not produced yet, so
    // anything already settled is not what it waits on. `waitingOnField` reads the rest off the
    // document's own connection list.
    const settledNodeIds = new Set(
      [...session.nodes]
        .filter(([, record]) => record.status !== 'queued' && record.status !== 'running')
        .map(([nodeId]) => nodeId),
    )

    for (const [nodeId, overlay] of base) {
      // `Node states` queued (design 671–676): the `Waiting on render.image` line and the three
      // flat placeholder bars, which nothing under `studio/` used to build. `overlay.status` is
      // the RAW node status, so a `skipped` node — which shares the queued CARD treatment — never
      // claims to be waiting on anything.
      if (overlay.status === 'queued' && document !== undefined) {
        const waitingOn = waitingOnField(document, nodeId, settledNodeIds)
        if (waitingOn !== undefined) {
          enriched.set(nodeId, { ...overlay, detail: { kind: 'queued', waitingOn } })
          continue
        }
      }

      const report = session.report?.nodes.find((node) => node.nodeId === nodeId)
      if (overlay.state !== 'ok' || report === null || report === undefined) {
        enriched.set(nodeId, overlay)
        continue
      }

      // `## Flow-local output UI`: the registered component fills the inline slot; an absent one
      // falls back to the generic JSON viewer. P12's resolver already encodes that fallback.
      const Output = resolveOutputComponent(extension, nodeId)
      // Closeout finding 1, ok: the settled `render` card of `Studio — default` (design 195–208)
      // draws BOTH — the output in the well and, in the slot's own 18px caption row, the mono
      // metadata row plus the producing node's name (`imageOut`, 206). So the flow-local
      // component keeps the well and the metadata row takes the caption row beside it; neither
      // replaces the other. `assetMetaParts` emits only what the `AssetDescriptor` carries — the
      // artboard's leading `1024×1024` is a dimension nothing on the wire has, and is not
      // fabricated here. A node with no asset output (a URL sink, say) gets no caption at all.
      const asset = Object.values(report.assets)[0]
      const producedBy = descriptor?.nodes.find((node) => node.id === nodeId)?.title
      enriched.set(nodeId, {
        ...overlay,
        // `Studio — default` and `2A` both draw a settled card's status as `● ok · 2.1s`.
        statusDot: true,
        outputSlot: {
          content: (
            <Output
              nodeId={nodeId}
              output={{ ...(report.output ?? {}), ...report.assets }}
              surface="card"
              assetUrl={assetUrl}
            />
          ),
          // `2A` puts an accent `inspect` in the caption row's trailing cell where
          // `Studio — default` puts the producing node's name. `NodeOutputSlot` treats them as
          // alternatives and `onInspect` wins, so a card that can open the viewer offers it and
          // one that cannot still names its source.
          onInspect: () => setViewerNodeId(nodeId),
          ...(asset === undefined
            ? {}
            : {
                caption: <MetadataRow parts={assetMetaParts(asset)} fontSize={9.5} gap={10} />,
                ...(producedBy === undefined ? {} : { source: producedBy }),
              }),
        },
      })
    }

    return enriched
  }, [session, extension, assetUrl, document, descriptor])

  // Ruling 1: keyed on the model INPUTS (descriptor, document, selection, overlays), never on the
  // previous `nodes`/`edges` output. `FlowCanvas` syncs from these two arrays by identity alone.
  const nodes = useMemo(() => {
    if (descriptor === undefined || document === undefined) return []
    return toCanvasNodes({
      descriptor,
      document,
      ...(studio.selectedNodeId === undefined ? {} : { selectedNodeId: studio.selectedNodeId }),
      ...(overlays === undefined ? {} : { overlays }),
      problems,
    })
  }, [descriptor, document, studio.selectedNodeId, overlays, problems])

  const edges = useMemo(
    () => (document === undefined ? [] : toCanvasEdges(document, problems)),
    [document, problems],
  )

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
        onCancel: askToCancel,
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
      // `2A`, the newest artboard, draws the completed panel as: node timings, the inputs still
      // shown and still editable, `Re-run start1 ⌘↵`, then `Log` / `tail`. The run's OUTPUTS are
      // not here — they are in the bottom output dock, which `canvas`'s `inspect` opens. So
      // `outputs` is deliberately not passed: passing it would draw the older
      // `Run panel — states` section as well and the panel would say everything twice.
      return {
        kind: 'completed',
        runNumber: studio.lastReport.runNumber,
        elapsed: formatElapsed(studio.lastReport.elapsedMs),
        nodes: toRunNodeTimings(session, order),
        entryNodeId: studio.startId,
        inputs: {
          descriptor: startNode.input,
          draft: studio.inputDraft,
          presentation: runInputPresentation(startNode.input, studio.inputDraft),
          onDraftChange: studio.setInputField,
        },
        log: { ...toRunLog(session), followLabel: 'tail' },
        onRerun: runFromDraft,
      }
    }

    return {
      kind: 'idle',
      entryNodeId: studio.startId,
      // Every start the descriptor declares. `RunIdleView` draws a chooser only past the first,
      // so `publication` — and every artboard — is unchanged.
      startIds: descriptor.startIds,
      onSelectStart: studio.selectStart,
      note: IDLE_NOTE,
      descriptor: startNode.input,
      input: toRunInputSchema(startNode.input),
      draft: studio.inputDraft,
      presentation: runInputPresentation(startNode.input, studio.inputDraft),
      onDraftChange: studio.setInputField,
      onRun: startRun,
      // The same predicate the docked control and the top-bar pill read, not a second one: two
      // places deciding whether this is runnable would drift.
      blocked: runBlocked,
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
    askToCancel,
    studio.lastReport,
    studio.inputDraft,
    studio.setInputField,
    studio.selectStart,
    startRun,
    runFromDraft,
    runBlocked,
  ])

  /**
   * Closeout finding 8-A: the run number reached no run state at all. `Studio — run in progress`
   * (design 592) puts it where the idle chevron was; the standalone settled cards (801, 838) add
   * the elapsed after it, the failed one in its own `#6d5f5c`. `RunDock` owns the treatment and
   * stays the dock's ONE header — `RunPanel` still returns a fragment and draws none, so this is
   * the whole hoist `RunStateHeader`'s doc comment reported as a gap.
   *
   * `RunStateHeader` itself is untouched: it is the standalone `RunPanelCard`'s header, and the
   * dock's left half keeps the entry point rather than a state title (264–273, 586–591).
   */
  const runMeta = useMemo<{ text: string; tone: RunDockMetaTone } | undefined>(() => {
    if (runPanelState === undefined || runPanelState.kind === 'idle') return undefined
    if (runPanelState.kind === 'running') {
      return { text: formatRunMeta(runPanelState.runNumber), tone: 'normal' }
    }
    return {
      text: formatRunMeta(runPanelState.runNumber, runPanelState.elapsed),
      tone: runPanelState.kind === 'failed' ? 'failed' : 'normal',
    }
  }, [runPanelState])

  /**
   * `2A`: once a run settles, the dock header's left half is `● Completed` or `● Run failed`
   * rather than `Run <entry>`. `Studio — run in progress` keeps the entry point while the run is in
   * flight, and the idle artboard has no state at all, so this is `undefined` in both.
   */
  const runDockStatus = useMemo<RunDockStatus | undefined>(() => {
    if (runPanelState === undefined) return undefined
    if (runPanelState.kind === 'completed') return 'completed'
    if (runPanelState.kind === 'failed') return 'failed'
    return undefined
  }, [runPanelState])

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
      // `3D`'s status strip is the only place the design names this shortcut.
      if (meta && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        requestValidate()
        return
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        studio.save()
        return
      }
      if (event.key === 'Escape') {
        // A modal that answered `esc` has already called `preventDefault()` on the way up (see
        // `ModalShell`). Without this, dismissing `3F`'s dialog while a run streamed also opened
        // `Cancel run #221?` off the same press, and `esc` out of that one re-opened it forever.
        if (event.defaultPrevented) return
        // R33: the `Output viewer` artboard (design lines 484–491) draws `Copy all` / `Download`
        // and no close control of its own. `Escape` is the least-invented way to keep it
        // closable without inventing a button the design does not have; it takes priority over
        // cancelling a run, since the viewer only ever opens once a run has already settled.
        if (viewerNodeId !== undefined) {
          closeViewer()
          return
        }
        if (running) askToCancel()
      }
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [
    running,
    startNode,
    studio.save,
    askToCancel,
    runFromDraft,
    viewerNodeId,
    closeViewer,
    requestValidate,
  ])

  const openViewerNode = useMemo(
    () => studio.lastReport?.nodes.find((node) => node.nodeId === viewerNodeId),
    [studio.lastReport, viewerNodeId],
  )

  const onNodeLayoutChange = studio.moveNode
  const onConnectFields = studio.connect

  /**
   * `2A`'s two mono strings for the dock — `render.image · Buffer[3] · run #221` open, and
   * `render.image · 3 files · run #221` collapsed.
   *
   * Every part is read off the report and the descriptor: the node, its first asset-bearing output
   * field, that field's own annotation, the number of asset fields the node actually produced, and
   * the run number. A node that produced no asset falls to the short form rather than a fabricated
   * one.
   */
  const outputDockStrings = useMemo(() => {
    if (openViewerNode === undefined) return undefined
    const fields = Object.keys(openViewerNode.assets)
    const field = fields[0]
    const annotation = descriptor?.nodes
      .find((node) => node.id === openViewerNode.nodeId)
      ?.output.fields.find((entry) => entry.field === field)?.annotation
    const args = {
      nodeId: openViewerNode.nodeId,
      fileCount: fields.length,
      ...(field === undefined ? {} : { field }),
      ...(studio.lastReport === undefined ? {} : { runNumber: studio.lastReport.runNumber }),
    }
    return {
      context: formatOutputContext({
        ...args,
        ...(annotation === undefined ? {} : { annotation }),
      }),
      summary: formatOutputSummary(args),
    }
  }, [openViewerNode, descriptor, studio.lastReport])

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

  // `FlowCanvas`'s `startNodeId` stays singular on purpose, and stays correct now that a flow may
  // declare several starts: it means "the selected entry point" — the node whose outgoing edges
  // take the accent tone — not "the flow's only start". `selectStart` is what moves it.
  const canvas = (
    <div className={s.canvas}>
      <div className={s.canvasSurface}>
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          {...(studio.startId === undefined ? {} : { startNodeId: studio.startId })}
          {...(studio.selectedNodeId === undefined
            ? {}
            : { selectedNodeId: studio.selectedNodeId })}
          {...(props.edgeShape === undefined ? {} : { edgeShape: props.edgeShape })}
          {...(props.showDotGrid === undefined ? {} : { showDotGrid: props.showDotGrid })}
          onNodeLayoutChange={onNodeLayoutChange}
          onConnectFields={onConnectFields}
        />
      </div>
      {openViewerNode === undefined ? null : (
        <OutputDock
          nodeId={openViewerNode.nodeId}
          output={{ ...(openViewerNode.output ?? {}), ...openViewerNode.assets }}
          {...(extension === undefined ? {} : { descriptor: extension })}
          assetUrl={assetUrl}
          {...(outputDockStrings === undefined ? {} : outputDockStrings)}
          raw={studio.lastReport}
          logs={viewerLogs}
          onCopyAll={onCopyAllOutput}
          onDownload={onDownloadOutput}
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
    studio.saveState.kind === 'conflict' ? (
      <SaveConflictChip onReload={studio.reloadFromDisk} onCopyDraft={studio.copyDraft} />
    ) : studio.saveState.kind === 'error' ? (
      <SaveErrorChip message={studio.saveState.error.message} />
    ) : running && studio.startId !== undefined ? (
      <RunningChip
        startId={studio.startId}
        elapsed={formatElapsed(studio.elapsedMs)}
        onCancel={askToCancel}
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

  const confirmCancel = useCallback(() => {
    setCancelPrompt(false)
    studio.cancel()
  }, [studio.cancel])

  // The node the `Cancel run` dialog names twice — the one still working. `2A`'s stream reports at
  // most one at a time; the first is the honest answer either way.
  const runningNodeId = useMemo(() => {
    if (session === undefined) return undefined
    for (const [nodeId, record] of session.nodes) {
      if (record.status === 'running') return nodeId
    }
    return undefined
  }, [session])

  /**
   * `3F`'s four answers. `esc` and both "switch now" buttons are synchronous; the other two each
   * do one thing to the flow being left before the switch is allowed to happen.
   */
  const stayOnFlow = useCallback(() => {
    setPendingFlowId(undefined)
    setSaveAndSwitchTo(undefined)
  }, [])

  /** `Switch and keep running` and `Discard changes`: one behaviour, two labels for what it costs. */
  const switchToPending = useCallback(() => {
    if (pendingFlowId === undefined) return
    switchTo(pendingFlowId)
  }, [pendingFlowId, switchTo])

  /**
   * `cancel()` reads `runTokenRef` and issues the request before its first `await`, so the request
   * is already aimed at the run being left by the time `switchTo` clears that ref. Reversing these
   * two lines would cancel nothing.
   */
  const cancelAndSwitch = useCallback(() => {
    if (pendingFlowId === undefined) return
    studio.cancel()
    switchTo(pendingFlowId)
  }, [pendingFlowId, studio.cancel, switchTo])

  const saveAndSwitch = useCallback(() => {
    // `save()` refuses while a run streams and with no draft loaded; parking a target it will
    // never move would leave the effect below switching on a write that never happened. The second
    // clause is the double-click guard: `save()` has no re-entrancy check of its own, and a second
    // write against the same `baseRevision` would come back a conflict.
    if (pendingFlowId === undefined || saveAndSwitchTo !== undefined) return
    if (running || draft === undefined) return
    setSaveAndSwitchTo(pendingFlowId)
    studio.save()
  }, [pendingFlowId, saveAndSwitchTo, running, draft, studio.save])

  /**
   * The other half of `Save and switch`. `save()` sets `saveState` to `saving` synchronously, in
   * the same event as the state above, so the first render after the click is already past the
   * early return and every later one carries the outcome.
   *
   * A rejected write — a revision conflict above all — does not switch. It also closes the dialog,
   * because the conflict chip's own `Reload` and `Copy draft` sit behind the scrim and are the
   * only way out of that state.
   */
  useEffect(() => {
    if (saveAndSwitchTo === undefined || studio.saveState.kind === 'saving') return
    setSaveAndSwitchTo(undefined)
    if (studio.saveState.kind !== 'idle') {
      setPendingFlowId(undefined)
      return
    }
    switchTo(saveAndSwitchTo)
  }, [saveAndSwitchTo, studio.saveState, switchTo])

  /**
   * The dialog asks about a state that can end on its own — a run settles, a save lands. Once
   * nothing is at risk the question has answered itself, so the switch the user asked for happens
   * rather than the dialog vanishing and leaving them where they were.
   */
  useEffect(() => {
    if (pendingFlowId === undefined || saveAndSwitchTo !== undefined) return
    if (running || draft?.dirty === true) return
    switchTo(pendingFlowId)
  }, [pendingFlowId, saveAndSwitchTo, running, draft?.dirty, switchTo])

  const pendingFlowName =
    pendingFlowId === undefined
      ? undefined
      : (studio.flows.find((flow) => flow.id === pendingFlowId)?.name ?? pendingFlowId)

  /**
   * Which body `3F` draws, recomputed rather than frozen at the click: a dialog still claiming a
   * run is in flight after it has settled would be printing a stale elapsed time.
   *
   * **A run in flight wins over an unsaved draft.** `3F` draws the two bodies apart and does not
   * say which one a flow in both states gets; the tie-break is that `save()` refuses while a run
   * streams — the top bar hides both `Save` and the dirty dot for the same reason — so an unsaved
   * body offered here would carry a primary that does nothing at all.
   */
  const switchFlowBody: SwitchFlowBody | undefined =
    pendingFlowId === undefined
      ? undefined
      : running && session !== undefined
        ? {
            kind: 'running',
            runNumber: session.runNumber ?? 0,
            elapsed: formatElapsed(studio.elapsedMs),
            nodeId: runningNodeId ?? studio.startId ?? '',
            onCancelAndSwitch: cancelAndSwitch,
            onSwitchAndKeepRunning: switchToPending,
          }
        : draft?.dirty === true
          ? {
              kind: 'unsaved',
              documentFile: descriptor?.documentFile ?? '',
              unsavedChanges: unsavedChangeCount(draft),
              onDiscardChanges: switchToPending,
              onSaveAndSwitch: saveAndSwitch,
            }
          : undefined

  const validationFindings = useMemo(() => {
    if (validation?.kind !== 'invalid') return undefined
    return toValidationFindings({ error: validation.error })
  }, [validation])

  /**
   * `3D` §3D.3 — the strip that replaces the bottom edge of the shell once a check has answered.
   * Absent before that, which is what every other artboard draws.
   *
   * `2 nodes · 2 connections` is the descriptor and the document; `checked <n> s ago` counts from
   * the moment the answer landed. Nothing here is a fixture.
   */
  const statusStrip = useMemo(() => {
    if (validation?.kind === 'valid' && descriptor !== undefined && document !== undefined) {
      return (
        <StatusStrip
          nodeCount={descriptor.nodes.length}
          connectionCount={document.connections.length}
          checkedAt={validation.checkedAt}
        />
      )
    }
    if (validation?.kind === 'invalid' && problems.problems.length > 0) {
      return <ProblemsStrip problems={problems.problems} onOpenReport={openReport} />
    }
    return undefined
  }, [validation, descriptor, document, problems, openReport])

  /**
   * The control's cell. `invalid` needs a count, so a state that has lost its findings — the one
   * frame between the flow changing and the sequence being reset — falls back to `idle` rather
   * than printing `0 errors`.
   */
  const validateState = useMemo<TopBarValidateState>(() => {
    if (validateAction.state === 'invalid') {
      return errorCount > 0 ? { state: 'invalid', errorCount } : { state: 'idle' }
    }
    return { state: validateAction.state }
  }, [validateAction.state, errorCount])

  return (
    <>
      <Studio
        {...(props.accent === undefined ? {} : { accent: props.accent })}
        flows={flowSummaries}
        {...(loaded && studio.flowId !== undefined ? { activeFlowId: studio.flowId } : {})}
        onSelectFlow={selectFlow}
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
        {...(runMeta === undefined ? {} : { runMeta: runMeta.text, runMetaTone: runMeta.tone })}
        {...(runDockStatus === undefined ? {} : { runStatus: runDockStatus })}
        {...(runHistory.length === 0
          ? {}
          : {
              runs: runHistory,
              ...(runHistory[0] === undefined ? {} : { selectedRunId: runHistory[0].id }),
            })}
        validate={validateState}
        runBlocked={runBlocked}
        {...(statusStrip === undefined ? {} : { status: statusStrip })}
        onValidate={requestValidate}
        onOpenReport={openReport}
        onSave={studio.save}
        onRun={runFromDraft}
      />
      {/*
        `3C`'s `Validation`. It opens only on a rejected document: the wire answers
        `{ valid: true }` with no findings, and no artboard draws an all-clear dialog, so a passing
        check stays as quiet as it was before. `flowFile` is the document's own name, which is what
        the top bar's badge already shows.
      */}
      {reportOpen && validationFindings !== undefined ? (
        <ValidationModal
          context={`${descriptor?.name ?? ''} · ${descriptor?.documentFile ?? ''}`}
          findings={validationFindings}
          onRevalidate={requestValidate}
          onDismiss={closeReport}
        />
      ) : null}
      {/*
        `3C`'s `Cancel run #219?`. Destructive, so a backdrop click does not dismiss it — only
        `esc`, `Keep running`, or the cancel itself.
      */}
      {cancelPrompt && running && session !== undefined ? (
        <CancelRunModal
          runNumber={session.runNumber ?? 0}
          elapsed={formatElapsed(studio.elapsedMs)}
          nodeId={runningNodeId ?? studio.startId ?? ''}
          onKeepRunning={keepRunning}
          onCancelRun={confirmCancel}
          onDismiss={keepRunning}
        />
      ) : null}
      {/*
        `3F`'s `Switch to <flow>?`. Destructive for the same reason `Cancel run` is: both of its
        ghosts give something up, so a stray backdrop click must not stand in for one. `esc` is the
        third action, and the footer hint names the flow it keeps.
      */}
      {switchFlowBody === undefined || pendingFlowName === undefined ? null : (
        <SwitchFlowModal
          currentFlowName={descriptor?.name ?? studio.flowId ?? ''}
          targetFlowName={pendingFlowName}
          body={switchFlowBody}
          onDismiss={stayOnFlow}
        />
      )}
    </>
  )
}
