import type { AssetDescriptor, FlowDocument } from '@jobik/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FieldConnection, NodeLayoutChange } from '#canvas/index.js'
import type {
  FlowListItem,
  JobikClient,
  LoadedFlowPayload,
  SafeFlowDescriptorPayload,
  WireErrorPayload,
  WireRunReportPayload,
} from '#client/index.js'
import { isRevisionConflictPayload, JobikServerError } from '#client/index.js'
import type { FlowUiDescriptor } from '#output/index.js'
import type { RunInputDraft, RunInputDraftValue } from '#run/index.js'
import {
  connectFields,
  createDraft,
  type FlowDraft,
  markSaved,
  moveNode,
  sameFlowShape,
} from './draft.js'
import { type ExternalModules, loadFlowUi } from './extensionLoader.js'
import { initialRunInputDraft } from './inputSchema.js'
import {
  applyRunEvent,
  createRunSession,
  markCancelFailed,
  markCancelling,
  type RunSession,
} from './runSession.js'

/**
 * The Studio's only stateful layer.
 *
 * `## UI and persistence` and `## Progress and cancellation` between them fix everything here: a
 * draft in memory, dirty after an edit, written only on Save; a revision conflict that offers
 * reload or copy-draft and never overwrites; a run that streams, locks the draft while it is in
 * flight, and can be cancelled from the editor.
 *
 * R10 — `selectFlow`, `selectNode`, a `validation` state field, `loading` and `loadError` were all
 * dropped from this module's public surface, because nothing downstream consumed any of them.
 * `selectedNodeId` itself stayed — `StudioApp` reads it — only the setter went. `isSettled` (R21)
 * was deleted from `runSession.ts` for the same reason and is neither imported nor re-exported
 * here.
 *
 * **Two of those five have since come back, and R10's sentence no longer describes this module.**
 * `validation` returned with `3C`'s dialog and `3D`'s problems strip — see the field's own doc
 * below. `selectFlow` returned because the config now declares three flows and the Studio could
 * only ever load, run and save `flows[0]`: `FlowsSidebar`'s flow rows are real buttons now, and
 * this is what they call. `selectNode`, `loading` and `loadError` are still absent and still have
 * no consumer.
 *
 * R25 — `runError` is deleted too. A start that fails used to null the session and stash the
 * failure only in `runError`, which nothing consumed: `runPanelState` fell through to `kind:
 * 'idle'` and the failure vanished. Every failure this hook can produce — a rejected start, a
 * failed cancel, a mid-stream parse error, a stream that ends without a terminal event — now
 * lands on `session.failure`, the one surface the run panel already knows how to render as
 * `kind: 'failed'`.
 *
 * 8-B narrows exactly one of those. A cancel whose failure arrives *after* the run has already
 * produced its own terminal line is dropped instead of written over that outcome, because the run
 * panel renders `failure` in place of the report and a completed run would lose its outputs to a
 * request that only failed because the run had already finished. `markCancelFailed` in
 * `runSession.ts` owns that rule; a cancel that fails while the run is still live is untouched.
 *
 * Every write to `session` from inside `run()` is a functional updater, and that is load-bearing
 * rather than stylistic. The stream loop used to fold events into a local `current` and write
 * `setSession(current)`, so `current` was a private copy of the session as it stood *before* the
 * run began — and every state change made outside the loop was erased by the next event to
 * arrive. Measured: a click on Cancel set `cancelling: true`, and the next `node-status` line put
 * it back to `false`, so the `Cancelling…` affordance went dark and told the user the click had
 * done nothing. The same shape sat on the rejected-start path, the dropped-stream path (R28) and
 * the `catch`. Only the fresh `createRunSession` is written as a plain value, because starting a
 * run is the one write that legitimately replaces the session rather than folding into it.
 *
 * The companion half of that rule lives in `applyRunEvent`: `run-settled` clears `failure`. Once
 * the writes stopped being erased, a cancel request that failed while the run was live (R27)
 * survived the run's own terminal line, and `StudioApp.runPanelState` paints `kind: 'failed'`
 * whenever `session.failure !== undefined` — so a successfully completed run rendered as an error
 * with its outputs gone. The run's own outcome wins over the outcome of a control action issued
 * against it, in both directions: 8-B drops the late cancel answer, and `run-settled` drops the
 * early one.
 *
 * `lastReport` is no longer state. It was a second `useState` holding a copy of `session.report`,
 * written by its own setter after the stream loop had already committed the settled session — so
 * settling, which is one transition, took two commits, and the frame in between showed the canvas
 * finished under a dock that still read in flight. It is now derived (see `lastReport` below) and
 * the two halves cannot come apart. `running` deliberately stays its own flag: it is not a
 * projection of the run's outcome but of whether the stream is still open, and it is the draft
 * lock's source.
 */

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | {
      readonly kind: 'conflict'
      readonly expectedRevision: string
      readonly actualRevision: string
    }
  | { readonly kind: 'error'; readonly error: WireErrorPayload }

/**
 * What `validate()` last found.
 *
 * `unreachable` is kept apart from `invalid` on purpose: the first means the check never ran, the
 * second means it ran and rejected the document, and the `Validation` dialog must not present a
 * transport failure as a finding about the flow.
 */
export type ValidationState =
  | { readonly kind: 'checking' }
  /** `checkedAt` is when the answer landed — `3D`'s status strip counts up from it. */
  | { readonly kind: 'valid'; readonly checkedAt: number }
  | { readonly kind: 'invalid'; readonly error: WireErrorPayload }
  | { readonly kind: 'unreachable'; readonly message: string }

export type StudioSession = {
  readonly flows: readonly FlowListItem[]
  readonly flowId: string | undefined
  readonly descriptor: SafeFlowDescriptorPayload | undefined
  readonly draft: FlowDraft | undefined
  readonly selectedNodeId: string | undefined
  /**
   * The start the run panel and the canvas are pointed at — one of `descriptor.startIds`, seeded
   * with the first and moved by `selectStart`.
   *
   * It used to be `descriptor?.startIds[0]`, which made every flow with more than one start
   * unrunnable past its first: the server, the wire and core have accepted any start id all
   * along, and the whole gap was here.
   */
  readonly startId: string | undefined
  readonly inputDraft: RunInputDraft
  readonly session: RunSession | undefined
  readonly lastReport: WireRunReportPayload | undefined
  readonly running: boolean
  /** Ticks while a run is in flight; the settled elapsed time afterwards. */
  readonly elapsedMs: number
  readonly saveState: SaveState
  readonly extension: FlowUiDescriptor | undefined
  /**
   * Points the whole Studio at another flow. Immediate and never blocked — not by a dirty draft,
   * and not by a run in flight.
   *
   * **A dirty draft is discarded, silently.** No artboard draws a confirmation dialog, and one
   * would have to be invented whole; the honest alternative — refusing the switch — would make a
   * flow unreachable because of an edit made in another. Save is `⌘S` and one click away, and the
   * top bar's dirty dot says the draft is unsaved before the switch is made.
   *
   * **A run in flight keeps going server-side and is never orphaned**; only its events stop
   * reaching the UI. See `runGenerationRef`.
   *
   * Every piece of per-flow state is written here, synchronously, in the same event as the id —
   * so there is no frame in which the previous flow's descriptor, draft, selection, inputs, run,
   * save state, extension or validation result is on screen under the new flow's id. An effect
   * would have left exactly that frame.
   */
  readonly selectFlow: (flowId: string) => void
  /**
   * Points the run panel at another of the flow's declared starts, re-seeding the input draft from
   * that start's own descriptor. Ignored while a run is in flight, and ignored for an id the
   * descriptor does not declare.
   */
  readonly selectStart: (startId: string) => void
  readonly moveNode: (change: NodeLayoutChange) => void
  readonly connect: (connection: FieldConnection) => void
  readonly setInputField: (field: string, value: RunInputDraftValue) => void
  readonly validate: () => void
  /**
   * The last check's outcome, or `undefined` before one has been asked for — **and `undefined`
   * again the moment the flow changes under it.**
   *
   * R10 removed this field as state nothing read. Artboard `3C` gave it a consumer — the
   * `Validation` dialog — so it is back, with exactly the shape that dialog needs and nothing
   * more: the check is running, it passed, or it produced the one error the wire carries.
   *
   * `3D` adds the lifetime: *"errors persist until the flow changes"*. A result is therefore kept
   * against the document it was produced for and withheld the moment that document's graph stops
   * matching the draft's — `sameFlowShape` in `draft.js` is what "the flow" means, and it
   * deliberately ignores `layout`, so dragging a card does not throw away a report the user is
   * still reading. This is a derivation, not an effect: there is no frame in which a stale result
   * is still on screen.
   */
  readonly validation: ValidationState | undefined
  readonly dismissValidation: () => void
  readonly save: () => void
  readonly reloadFromDisk: () => void
  readonly copyDraft: () => void
  readonly run: (values: Record<string, unknown>) => void
  readonly cancel: () => void
  readonly assetUrl: (descriptor: AssetDescriptor) => string
}

/** How often the running chip's clock re-renders. Fast enough for a `0.1s` readout. */
const TICK_MS = 100

/**
 * R28: the reducer in `runSession.ts` relies on the server's structural guarantee that the
 * stream's last line is always `run-settled` or `run-failed`, and deliberately does not defend
 * against a stream that violates it — a pure reducer cannot repair that. A dropped connection is
 * real, though, and this hook is the right place to catch it: iteration can complete normally
 * with neither `report` nor `failure` set, and without this the run would vanish from the panel
 * with no trace.
 */
const DROPPED_STREAM_PAYLOAD: WireErrorPayload = {
  _tag: null,
  message: 'The connection to the server closed before the run produced a result.',
}

/**
 * Turns any `Error` this hook can receive from the client into the `WireErrorPayload` shape the
 * run panel renders. A `JobikServerError`'s `.payload` is exactly what the server sent and is
 * passed through untouched — never re-tagged, never re-humanised. Anything else (a
 * `JobikTransportError`, an `NdjsonParseError`) has no server payload, so it is surfaced honestly
 * as what it is: its own `_tag` when it is a tagged error, and its own message.
 */
function toFailurePayload(error: Error): WireErrorPayload {
  if (error instanceof JobikServerError) return error.payload
  const tag = (error as { _tag?: unknown })._tag
  return { _tag: typeof tag === 'string' ? tag : null, message: error.message }
}

export function useStudioSession(args: {
  client: JobikClient
  flowId?: string
  externals?: ExternalModules
  importModule?: (url: string) => Promise<unknown>
  now?: () => number
}): StudioSession {
  const { client } = args
  const now = args.now ?? Date.now

  const [flows, setFlows] = useState<readonly FlowListItem[]>([])
  const [flowId, setFlowId] = useState<string | undefined>(args.flowId)
  const [descriptor, setDescriptor] = useState<SafeFlowDescriptorPayload | undefined>(undefined)
  const [draft, setDraft] = useState<FlowDraft | undefined>(undefined)
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined)
  const [startId, setStartId] = useState<string | undefined>(undefined)
  const [inputDraft, setInputDraft] = useState<RunInputDraft>({})
  const [session, setSession] = useState<RunSession | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [validation, setValidation] = useState<ValidationState | undefined>(undefined)
  /** The document the current `validation` was produced for. See `validation` above. */
  const [validatedFor, setValidatedFor] = useState<FlowDocument | undefined>(undefined)
  const [extension, setExtension] = useState<FlowUiDescriptor | undefined>(undefined)
  const [tick, setTick] = useState(0)

  /** The run token, read by `cancel()` without making it a render dependency. */
  const runTokenRef = useRef<string | undefined>(undefined)
  const startedAtRef = useRef(0)
  /** The caller's initial flow choice, read once by discovery without widening its deps. */
  const initialFlowIdRef = useRef(args.flowId)
  /**
   * Guards `run()` against re-entrancy: `setRunning(true)` does not apply until the next render,
   * so two calls issued in the same tick both see `running === false` from the closure. This ref
   * is set synchronously, before either state update lands.
   */
  const runningRef = useRef(false)
  /**
   * Bumped by every fetch that can call `adopt()` — the mount load effect and `reloadFromDisk()`.
   * Whichever request's generation stops matching this ref by the time it resolves is stale and
   * is discarded, so a slow response from one can never land over a faster one from the other.
   */
  const loadGenerationRef = useRef(0)
  /**
   * The run's counterpart to `loadGenerationRef`, and the whole of the "a run in flight must not
   * corrupt the flow you switched to" rule.
   *
   * `run()` reads this ref once, before its first `await`, and every write it would make
   * afterwards — the session fold, the dropped-stream repair, the parse-error failure, and the
   * closing `setRunning(false)` — is gated on the ref still holding that number. `selectFlow`
   * bumps it, and so does the next `run()`. So a run started under flow A stops painting the
   * instant the user leaves flow A, while the `for await` keeps draining: the request is never
   * aborted, the server settles the run and writes its report, and nothing is orphaned.
   *
   * **Accepted limitation:** coming back to flow A shows a fresh load, not the run that is still
   * live. Keeping a live session per flow would mean a map of sessions, a map of tokens and a
   * clock per entry, and no artboard draws a second flow's run at all. Out of scope, deliberately.
   */
  const runGenerationRef = useRef(0)
  /**
   * R29: `externals`/`importModule` are read through refs, not the effect's dependency list.
   * `StudioApp` (task 13) passes both as fresh object/function literals on every render, and
   * `StudioApp` itself re-renders every `TICK_MS` while a run is in flight — a dependency list
   * that included them would refetch and re-evaluate the extension bundle on every tick.
   */
  const externalsRef = useRef(args.externals)
  externalsRef.current = args.externals
  const importModuleRef = useRef(args.importModule)
  importModuleRef.current = args.importModule

  /**
   * Derived, never stored. `lastReport` used to be its own `useState`, written after the stream
   * loop had already committed the settled session — two setters, two commits, and a frame in
   * between where the canvas had settled and the dock had not. Settling is one transition, so it
   * gets one state write; making the report a projection of the session it belongs to means the
   * two cannot disagree at all, rather than merely being written together today.
   *
   * This loses nothing, because the stored value was already a copy of exactly this: `run()` set
   * it to `undefined` beside every fresh `createRunSession` (whose `report` is `undefined`) and to
   * `current.report` on the one path where the session carried one. Every other outcome — a
   * rejected start, `run-failed`, a dropped stream, a parse error — left both `undefined`.
   */
  const lastReport = session?.report

  /**
   * Pointing the panel at a start: the id itself, the node the canvas and sidebar mark, and the
   * input draft seeded from that start's own descriptor.
   *
   * Extracted out of `adopt`, which used to be its only caller and did all three inline against
   * `startIds[0]`. `selectStart` needs the identical three writes against a different id, and two
   * copies of "what it means to choose a start" would have drifted the first time one of them
   * gained a fourth.
   */
  const seedStart = useCallback(
    (loadedDescriptor: SafeFlowDescriptorPayload, start: string | undefined) => {
      const startNode = loadedDescriptor.nodes.find((node) => node.id === start)
      setStartId(start)
      setSelectedNodeId(start)
      setInputDraft(startNode === undefined ? {} : initialRunInputDraft(startNode.input))
    },
    [],
  )

  const adopt = useCallback(
    (loaded: LoadedFlowPayload) => {
      setDescriptor(loaded.descriptor)
      setDraft(createDraft(loaded.document, loaded.revision))
      setSaveState({ kind: 'idle' })
      seedStart(loaded.descriptor, loaded.descriptor.startIds[0])
    },
    [seedStart],
  )

  const selectStart = useCallback(
    (nextStartId: string) => {
      // The draft lock a run holds covers the start too: the run in flight *is* a run of the start
      // currently selected, and moving it under the stream would leave the panel describing one
      // start and the canvas another.
      if (running || descriptor === undefined) return
      if (nextStartId === startId) return
      if (!descriptor.startIds.includes(nextStartId)) return
      seedStart(descriptor, nextStartId)
    },
    [descriptor, running, seedStart, startId],
  )

  /**
   * See `selectFlow` in `StudioSession` for what this guarantees and why the writes are here
   * rather than in an effect keyed on `flowId`.
   *
   * The two generation bumps are the load and the run: an in-flight `GET /api/flows/:id` for the
   * previous flow can no longer adopt over this one, and an in-flight run can no longer paint
   * over it. The three refs are cleared for the same reason as their state counterparts —
   * `runTokenRef` in particular, because `cancel()` reads it without a render dependency and must
   * not aim a cancel request at the flow the user just left.
   *
   * `validation` is dropped **unconditionally**, not through `sameFlowShape`: that comparison
   * exists so a drag does not throw away findings the user is still reading *within one flow*, and
   * a finding about flow `#1` says nothing at all about flow `#2`. Clearing it here is what also
   * clears `checkedAt` and the problems strip, both of which are derived from it.
   */
  const selectFlow = useCallback(
    (nextFlowId: string) => {
      if (nextFlowId === flowId) return

      loadGenerationRef.current += 1
      runGenerationRef.current += 1
      runTokenRef.current = undefined
      runningRef.current = false
      startedAtRef.current = 0

      setDescriptor(undefined)
      setDraft(undefined)
      setStartId(undefined)
      setSelectedNodeId(undefined)
      setInputDraft({})
      setSaveState({ kind: 'idle' })
      setSession(undefined)
      setRunning(false)
      setValidation(undefined)
      setValidatedFor(undefined)
      setExtension(undefined)
      setFlowId(nextFlowId)
    },
    [flowId],
  )

  // R5: discovery and load are two effects, not one. A single effect that reads `flowId`, sets it,
  // and lists `flowId` in its own dependencies double-fires on mount: pass 1 lists the flows, sets
  // the id and consumes the first mocked response; the id change re-fires the effect and its
  // cleanup cancels pass 1; pass 2 re-lists and consumes the second. Discovery below never loads a
  // flow itself — it only lists them and seeds the initial id — so `GET /api/flows/:id` fires
  // exactly once per real mount, from the load effect that follows it.
  useEffect(() => {
    let cancelled = false

    const discover = async () => {
      const listed = await client.listFlows()
      if (cancelled) return
      if (listed instanceof Error) return
      setFlows(listed)
      const nextId = initialFlowIdRef.current ?? listed[0]?.id
      if (nextId === undefined) return
      setFlowId(nextId)
    }

    void discover()
    return () => {
      cancelled = true
    }
  }, [client])

  // Loads only once `flowId` is known — from discovery above, or from a caller-driven change.
  // The generation guard (see `loadGenerationRef` above) keeps this from adopting a stale
  // response over one `reloadFromDisk()` already landed while this fetch was still in flight.
  useEffect(() => {
    if (flowId === undefined) return
    let cancelled = false
    loadGenerationRef.current += 1
    const generation = loadGenerationRef.current

    const load = async () => {
      const loaded = await client.loadFlow(flowId)
      if (cancelled || loadGenerationRef.current !== generation) return
      if (loaded instanceof Error) return
      adopt(loaded)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [client, flowId, adopt])

  // The flow-local extension. A failure is not an error state: `## Flow-local output UI` says an
  // absent renderer falls back to the generic JSON viewer, and so does a broken one.
  useEffect(() => {
    if (flowId === undefined) return
    let cancelled = false

    const load = async () => {
      const url = client.extensionBundleUrl(flowId)
      const descriptorOrError = await loadFlowUi({
        fetchBundle: async () => {
          const response = await fetch(url)
          if (!response.ok) throw new Error(`the server answered ${response.status}`)
          return response.text()
        },
        externals: externalsRef.current ?? {},
        ...(importModuleRef.current === undefined ? {} : { importModule: importModuleRef.current }),
      })
      if (cancelled) return
      setExtension(descriptorOrError instanceof Error ? undefined : descriptorOrError)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [client, flowId])

  // The running chip's clock.
  useEffect(() => {
    if (!running) return
    const handle = setInterval(() => setTick((value) => value + 1), TICK_MS)
    return () => clearInterval(handle)
  }, [running])

  const onMoveNode = useCallback(
    (change: NodeLayoutChange) => {
      if (running) return
      setDraft((current) => (current === undefined ? current : moveNode(current, change)))
    },
    [running],
  )

  const onConnect = useCallback(
    (connection: FieldConnection) => {
      if (running) return
      setDraft((current) => (current === undefined ? current : connectFields(current, connection)))
    },
    [running],
  )

  const setInputField = useCallback(
    (field: string, value: RunInputDraftValue) => {
      if (running) return
      setInputDraft((current) => ({ ...current, [field]: value }))
    },
    [running],
  )

  const validate = useCallback(() => {
    if (running || flowId === undefined || draft === undefined) return
    // Captured now, not when the answer lands: an edit made while the request is in flight is
    // exactly the case the result must not survive, and this comparison is what catches it.
    setValidatedFor(draft.document)
    setValidation({ kind: 'checking' })
    void (async () => {
      // `client.validate` follows the `T | Error` contract and never throws, so an `Error` here is
      // a transport failure rather than a rejected document — the two are kept apart because the
      // dialog says different things about them.
      const result = await client.validate(flowId, draft.document)
      if (result instanceof Error) {
        setValidation({ kind: 'unreachable', message: result.message })
        return
      }
      setValidation(
        result.valid
          ? { kind: 'valid', checkedAt: now() }
          : { kind: 'invalid', error: result.error },
      )
    })()
  }, [client, draft, flowId, running, now])

  const dismissValidation = useCallback(() => {
    setValidation(undefined)
    setValidatedFor(undefined)
  }, [])

  /**
   * `3D` — the result, withheld once the flow it describes no longer exists. See `validation` in
   * `StudioSession` for why this is derived rather than cleared by an effect.
   */
  const activeValidation = useMemo(() => {
    if (validation === undefined || validatedFor === undefined || draft === undefined) {
      return validation
    }
    return sameFlowShape(validatedFor, draft.document) ? validation : undefined
  }, [validation, validatedFor, draft])

  const save = useCallback(() => {
    if (running || flowId === undefined || draft === undefined) return
    // R18: capture the exact document being sent now. `markSaved` below compares it by identity to
    // whatever the draft holds when the response arrives — if an edit landed while the request was
    // in flight, that comparison is what keeps the draft dirty instead of silently overwriting it.
    const sentDocument = draft.document
    void (async () => {
      setSaveState({ kind: 'saving' })
      const result = await client.save(flowId, sentDocument, draft.baseRevision)

      if (result instanceof JobikServerError) {
        // `## UI and persistence`: offer reload or copy-draft. Never overwrite, never retry with
        // the revision the server reported.
        if (isRevisionConflictPayload(result.payload)) {
          setSaveState({
            kind: 'conflict',
            expectedRevision: result.payload.expectedRevision,
            actualRevision: result.payload.actualRevision,
          })
          return
        }
        setSaveState({ kind: 'error', error: result.payload })
        return
      }
      if (result instanceof Error) {
        setSaveState({ kind: 'error', error: { _tag: null, message: result.message } })
        return
      }

      setDraft((current) =>
        current === undefined ? current : markSaved(current, sentDocument, result.revision),
      )
      setSaveState({ kind: 'idle' })
    })()
  }, [client, draft, flowId, running])

  const reloadFromDisk = useCallback(() => {
    if (flowId === undefined) return
    loadGenerationRef.current += 1
    const generation = loadGenerationRef.current
    void (async () => {
      const loaded = await client.loadFlow(flowId)
      if (loadGenerationRef.current !== generation) return
      if (loaded instanceof Error) return
      adopt(loaded)
    })()
  }, [client, flowId, adopt])

  const copyDraft = useCallback(() => {
    if (draft === undefined) return
    const text = JSON.stringify(draft.document, null, 2)
    void globalThis.navigator?.clipboard?.writeText(text)
  }, [draft])

  const run = useCallback(
    (values: Record<string, unknown>) => {
      if (
        runningRef.current ||
        flowId === undefined ||
        descriptor === undefined ||
        startId === undefined
      ) {
        return
      }
      runningRef.current = true
      // Read once, before the first `await`. Everything below asks `live()` whether the flow this
      // run belongs to is still the one on screen; see `runGenerationRef`.
      runGenerationRef.current += 1
      const generation = runGenerationRef.current
      const live = () => runGenerationRef.current === generation

      void (async () => {
        startedAtRef.current = now()
        runTokenRef.current = undefined

        // The one write in this run that is deliberately not a functional updater: a fresh run
        // *replaces* whatever the panel was showing rather than folding into it.
        setSession(
          createRunSession({
            startId,
            nodeIds: descriptor.nodes.map((node) => node.id),
            startedAt: startedAtRef.current,
          }),
        )
        setRunning(true)

        const stream = await client.startRun({ flowId, startId, input: values })
        if (stream instanceof Error) {
          // R25: a rejected start no longer nulls the session — it ends it as a failure, the
          // same surface every other failure path below uses.
          if (!live()) return
          const payload = toFailurePayload(stream)
          setSession((current) =>
            current === undefined ? current : { ...current, failure: payload },
          )
          setRunning(false)
          runningRef.current = false
          return
        }

        try {
          for await (const event of stream) {
            // `continue`, not `break`: the flow changed under this run, so nothing it says may
            // reach the panel any more — but the stream is still drained to completion so the
            // server settles the run rather than being left with a reader that walked away.
            if (!live()) continue
            if (event.type === 'run-accepted') runTokenRef.current = event.runToken
            setSession((current) =>
              current === undefined ? current : applyRunEvent(current, event),
            )
          }
          // R28: the stream ended without a terminal line. `applyRunEvent` never sets `failure`
          // or `report` on its own for that case — only `run-settled` and `run-failed` do — so a
          // session that reaches here with neither is a dropped connection, not a settled run.
          // The test for it is inside the updater because that is the only place that can see
          // the session as it actually stands (see the note on functional updaters at the top of
          // this module).
          if (live()) {
            setSession((current) => {
              if (current === undefined) return current
              if (current.report !== undefined || current.failure !== undefined) return current
              return { ...current, failure: DROPPED_STREAM_PAYLOAD }
            })
          }
        } catch (cause) {
          // R16: `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a protocol
          // violation, and `JobikClient.startRun` deliberately does not catch it — this `for
          // await` is the one place that owns the failure.
          const error = cause instanceof Error ? cause : new Error(String(cause))
          const payload = toFailurePayload(error)
          if (live()) {
            setSession((current) =>
              current === undefined ? current : { ...current, failure: payload },
            )
          }
        }

        // Guarded like every write above: `selectFlow` has already put `running` back to `false`
        // for this run, and a run started under the new flow owns the flag now — clearing it from
        // here would unlock a draft the live run is still holding.
        if (live()) {
          setRunning(false)
          runningRef.current = false
        }
      })()
    },
    [client, descriptor, flowId, now, startId],
  )

  const cancel = useCallback(() => {
    // The ref is deliberately not a render dependency, so it is `selectFlow` that keeps this
    // honest across a flow switch: it clears the token, and the stale run's `for await` can no
    // longer write a new one (`live()`), so a cancel issued after a switch aims at nothing rather
    // than at the run belonging to the flow the user just left.
    const token = runTokenRef.current
    if (token === undefined) return
    setSession((current) => (current === undefined ? current : markCancelling(current)))
    // The stream is NOT closed here. `## Progress and cancellation`: the server settles the run with
    // the abort error and keeps already-settled node results, and that terminal line ends the run.
    void (async () => {
      const result = await client.cancelRun(token)
      // R27: a failed cancel request used to be discarded with `void`, leaving `cancelling: true`
      // forever with nothing telling the user the request never reached the server. Reuses the
      // same `session.failure` surface R25 routes every other failure through.
      //
      // 8-B: `markCancelFailed`, not a spread, and the decision is made inside the updater so it
      // reads the session as it stands when the answer lands — which is the whole race. If the
      // run settled while this request was in flight the answer is dropped there; see the
      // invariant on `markCancelFailed` in `runSession.ts`.
      if (result instanceof Error) {
        const payload = toFailurePayload(result)
        setSession((current) =>
          current === undefined ? current : markCancelFailed(current, payload),
        )
      }
    })()
  }, [client])

  const assetUrl = useCallback((asset: AssetDescriptor) => client.assetUrl(asset), [client])

  const elapsedMs = useMemo(() => {
    if (running) {
      void tick
      return now() - startedAtRef.current
    }
    return lastReport?.elapsedMs ?? 0
  }, [running, tick, now, lastReport])

  return {
    flows,
    flowId,
    descriptor,
    draft,
    selectedNodeId,
    startId,
    inputDraft,
    session,
    lastReport,
    running,
    elapsedMs,
    saveState,
    extension,
    selectFlow,
    selectStart,
    moveNode: onMoveNode,
    connect: onConnect,
    setInputField,
    validate,
    validation: activeValidation,
    dismissValidation,
    save,
    reloadFromDisk,
    copyDraft,
    run,
    cancel,
    assetUrl,
  }
}
