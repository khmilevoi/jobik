import type { AssetDescriptor } from '@jobik/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FieldConnection, NodeLayoutChange } from '../canvas/index.js'
import type {
  FlowListItem,
  JobikClient,
  LoadedFlowPayload,
  SafeFlowDescriptorPayload,
  WireErrorPayload,
  WireRunReportPayload,
} from '../client/index.js'
import { isRevisionConflictPayload, JobikServerError } from '../client/index.js'
import type { FlowUiDescriptor } from '../output/index.js'
import type { RunInputDraft, RunInputDraftValue } from '../run/index.js'
import { connectFields, createDraft, type FlowDraft, markSaved, moveNode } from './draft.js'
import { type ExternalModules, loadFlowUi } from './extensionLoader.js'
import { initialRunInputDraft } from './inputSchema.js'
import { applyRunEvent, createRunSession, markCancelling, type RunSession } from './runSession.js'

/**
 * The Studio's only stateful layer.
 *
 * `## UI and persistence` and `## Progress and cancellation` between them fix everything here: a
 * draft in memory, dirty after an edit, written only on Save; a revision conflict that offers
 * reload or copy-draft and never overwrites; a run that streams, locks the draft while it is in
 * flight, and can be cancelled from the editor.
 *
 * R10 — `selectFlow`, `selectNode`, a `validation` state field, `loading` and `loadError` were all
 * dropped from this module's public surface. `StudioApp` (task 12) never wires a selection
 * callback (`Studio`/`FlowsSidebar` expose none) and never renders anything derived from a
 * validation result or a loading/load-error flag, so all five were produced with no consumer.
 * `selectedNodeId` itself stays — `StudioApp` reads it — only the setter is gone. `validate()`
 * stays too, wired to the Validate button; it fires the request and does not keep the result,
 * because nothing downstream has anywhere left to show it. `isSettled` (R21) was deleted from
 * `runSession.ts` for the same reason and is neither imported nor re-exported here.
 *
 * R25 — `runError` is deleted too. A start that fails used to null the session and stash the
 * failure only in `runError`, which nothing consumed: `runPanelState` fell through to `kind:
 * 'idle'` and the failure vanished. Every failure this hook can produce — a rejected start, a
 * failed cancel, a mid-stream parse error, a stream that ends without a terminal event — now
 * lands on `session.failure`, the one surface the run panel already knows how to render as
 * `kind: 'failed'`.
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

export type StudioSession = {
  readonly flows: readonly FlowListItem[]
  readonly flowId: string | undefined
  readonly descriptor: SafeFlowDescriptorPayload | undefined
  readonly draft: FlowDraft | undefined
  readonly selectedNodeId: string | undefined
  readonly startId: string | undefined
  readonly inputDraft: RunInputDraft
  readonly session: RunSession | undefined
  readonly lastReport: WireRunReportPayload | undefined
  readonly running: boolean
  /** Ticks while a run is in flight; the settled elapsed time afterwards. */
  readonly elapsedMs: number
  readonly saveState: SaveState
  readonly extension: FlowUiDescriptor | undefined
  readonly moveNode: (change: NodeLayoutChange) => void
  readonly connect: (connection: FieldConnection) => void
  readonly setInputField: (field: string, value: RunInputDraftValue) => void
  readonly validate: () => void
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
  const [inputDraft, setInputDraft] = useState<RunInputDraft>({})
  const [session, setSession] = useState<RunSession | undefined>(undefined)
  const [lastReport, setLastReport] = useState<WireRunReportPayload | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
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
   * R29: `externals`/`importModule` are read through refs, not the effect's dependency list.
   * `StudioApp` (task 13) passes both as fresh object/function literals on every render, and
   * `StudioApp` itself re-renders every `TICK_MS` while a run is in flight — a dependency list
   * that included them would refetch and re-evaluate the extension bundle on every tick.
   */
  const externalsRef = useRef(args.externals)
  externalsRef.current = args.externals
  const importModuleRef = useRef(args.importModule)
  importModuleRef.current = args.importModule

  const startId = descriptor?.startIds[0]

  const adopt = useCallback((loaded: LoadedFlowPayload) => {
    setDescriptor(loaded.descriptor)
    setDraft(createDraft(loaded.document, loaded.revision))
    setSaveState({ kind: 'idle' })
    const start = loaded.descriptor.startIds[0]
    const startNode = loaded.descriptor.nodes.find((node) => node.id === start)
    setSelectedNodeId(start)
    setInputDraft(startNode === undefined ? {} : initialRunInputDraft(startNode.input))
  }, [])

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
    // Fires the check and stops there: R10 deleted the `validation` state nothing downstream
    // reads. `client.validate` follows the `T | Error` contract and never throws, so this is a
    // legitimate fire-and-forget.
    void client.validate(flowId, draft.document)
  }, [client, draft, flowId, running])

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

      void (async () => {
        setLastReport(undefined)
        startedAtRef.current = now()
        runTokenRef.current = undefined

        let current = createRunSession({
          startId,
          nodeIds: descriptor.nodes.map((node) => node.id),
          startedAt: startedAtRef.current,
        })
        setSession(current)
        setRunning(true)

        const stream = await client.startRun({ flowId, startId, input: values })
        if (stream instanceof Error) {
          // R25: a rejected start no longer nulls the session — it ends it as a failure, the
          // same surface every other failure path below uses.
          current = { ...current, failure: toFailurePayload(stream) }
          setSession(current)
          setRunning(false)
          runningRef.current = false
          return
        }

        try {
          for await (const event of stream) {
            current = applyRunEvent(current, event)
            if (event.type === 'run-accepted') runTokenRef.current = event.runToken
            setSession(current)
          }
          // R28: the stream ended without a terminal line. `applyRunEvent` never sets `failure`
          // or `report` on its own for that case — only `run-settled` and `run-failed` do — so a
          // session that reaches here with neither is a dropped connection, not a settled run.
          if (current.report === undefined && current.failure === undefined) {
            current = { ...current, failure: DROPPED_STREAM_PAYLOAD }
            setSession(current)
          }
        } catch (cause) {
          // R16: `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a protocol
          // violation, and `JobikClient.startRun` deliberately does not catch it — this `for
          // await` is the one place that owns the failure.
          const error = cause instanceof Error ? cause : new Error(String(cause))
          current = { ...current, failure: toFailurePayload(error) }
          setSession(current)
        }

        if (current.report !== undefined) setLastReport(current.report)
        setRunning(false)
        runningRef.current = false
      })()
    },
    [client, descriptor, flowId, now, startId],
  )

  const cancel = useCallback(() => {
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
      if (result instanceof Error) {
        const payload = toFailurePayload(result)
        setSession((current) =>
          current === undefined ? current : { ...current, failure: payload },
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
    moveNode: onMoveNode,
    connect: onConnect,
    setInputField,
    validate,
    save,
    reloadFromDisk,
    copyDraft,
    run,
    cancel,
    assetUrl,
  }
}
