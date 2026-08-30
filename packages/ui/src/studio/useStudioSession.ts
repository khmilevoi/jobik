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
 * R10 — `selectFlow`, `selectNode` and a `validation` state field were dropped from this module's
 * public surface. `StudioApp` (task 12) never wires a selection callback (`Studio`/`FlowsSidebar`
 * expose none) and never renders anything derived from a validation result, so both were produced
 * with no consumer. `selectedNodeId` itself stays — `StudioApp` reads it — only the setter is gone.
 * `validate()` stays too, wired to the Validate button; it fires the request and does not keep the
 * result, because nothing downstream has anywhere left to show it. `isSettled` (R21) was deleted
 * from `runSession.ts` for the same reason and is neither imported nor re-exported here.
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
  readonly loading: boolean
  readonly loadError: Error | undefined
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
  readonly runError: Error | undefined
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
  const [runError, setRunError] = useState<Error | undefined>(undefined)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [extension, setExtension] = useState<FlowUiDescriptor | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | undefined>(undefined)
  const [tick, setTick] = useState(0)

  /** The run token, read by `cancel()` without making it a render dependency. */
  const runTokenRef = useRef<string | undefined>(undefined)
  const startedAtRef = useRef(0)
  /** The caller's initial flow choice, read once by discovery without widening its deps. */
  const initialFlowIdRef = useRef(args.flowId)

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
      if (listed instanceof Error) {
        setLoadError(listed)
        setLoading(false)
        return
      }
      setFlows(listed)
      const nextId = initialFlowIdRef.current ?? listed[0]?.id
      if (nextId === undefined) {
        setLoading(false)
        return
      }
      setFlowId(nextId)
    }

    void discover()
    return () => {
      cancelled = true
    }
  }, [client])

  // Loads only once `flowId` is known — from discovery above, or from a caller-driven change.
  useEffect(() => {
    if (flowId === undefined) return
    let cancelled = false
    setLoading(true)

    const load = async () => {
      const loaded = await client.loadFlow(flowId)
      if (cancelled) return
      if (loaded instanceof Error) {
        setLoadError(loaded)
        setLoading(false)
        return
      }
      adopt(loaded)
      setLoadError(undefined)
      setLoading(false)
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
        externals: args.externals ?? {},
        ...(args.importModule === undefined ? {} : { importModule: args.importModule }),
      })
      if (cancelled) return
      setExtension(descriptorOrError instanceof Error ? undefined : descriptorOrError)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [client, flowId, args.externals, args.importModule])

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
    void (async () => {
      const loaded = await client.loadFlow(flowId)
      if (loaded instanceof Error) {
        setLoadError(loaded)
        return
      }
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
      if (running || flowId === undefined || descriptor === undefined || startId === undefined) {
        return
      }

      void (async () => {
        setRunError(undefined)
        setLastReport(undefined)
        startedAtRef.current = now()
        runTokenRef.current = undefined

        const seeded = createRunSession({
          startId,
          nodeIds: descriptor.nodes.map((node) => node.id),
          startedAt: startedAtRef.current,
        })
        setSession(seeded)
        setRunning(true)

        const stream = await client.startRun({ flowId, startId, input: values })
        if (stream instanceof Error) {
          setRunError(stream)
          setRunning(false)
          setSession(undefined)
          return
        }

        let current = seeded
        try {
          for await (const event of stream) {
            current = applyRunEvent(current, event)
            if (event.type === 'run-accepted') runTokenRef.current = event.runToken
            setSession(current)
          }
        } catch (cause) {
          // R16: `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a protocol
          // violation, and `JobikClient.startRun` deliberately does not catch it — this `for
          // await` is the one place that owns the failure. Surfaced two ways: `runError` for the
          // raw cause, and `session.failure` so the run panel renders it as a failed run instead
          // of leaving the stream silently unsettled.
          const error = cause instanceof Error ? cause : new Error(String(cause))
          setRunError(error)
          current = { ...current, failure: { _tag: null, message: error.message } }
          setSession(current)
        }

        if (current.report !== undefined) setLastReport(current.report)
        setRunning(false)
      })()
    },
    [client, descriptor, flowId, now, running, startId],
  )

  const cancel = useCallback(() => {
    const token = runTokenRef.current
    if (token === undefined) return
    setSession((current) => (current === undefined ? current : markCancelling(current)))
    // The stream is NOT closed here. `## Progress and cancellation`: the server settles the run with
    // the abort error and keeps already-settled node results, and that terminal line ends the run.
    void client.cancelRun(token)
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
    loading,
    loadError,
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
    runError,
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
