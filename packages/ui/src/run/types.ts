/**
 * The run panel's props vocabulary.
 *
 * Every state is fixture-driven: nothing here talks to a server, streams a run, or derives a
 * descriptor. Mapping a real run report and a live stream onto `RunPanelState` is P14's job.
 */
import type { FlowDocument, NodeInputDescriptor } from '@jobik/core'
import type * as z from 'zod'

/**
 * The closed per-node status set from `### Node status vocabulary`, mirroring core's `NodeStatus`
 * one for one so a status can never be silently collapsed into a neighbouring one on the way here.
 *
 * `cached` stays unreachable in v1 (standing ruling 3) and still has no run-panel artboard of its
 * own; it is carried anyway because the alternative — the mapping `runPresenter.ts` used to do,
 * `cached` → `ok` — reports a cached node as a freshly computed one. Its row borrows the two things
 * the `Node states` cached card does fix: the `#4a5157` dot (design 747) and the `cached · 0.0s`
 * label (750). Everything the design leaves open stays as the list already draws a settled node.
 */
export type RunNodeStatus = 'queued' | 'running' | 'ok' | 'failed' | 'skipped' | 'cached'

export type RunNodeTiming = {
  readonly nodeId: string
  readonly status: RunNodeStatus
  /** e.g. `2.1s`. When omitted the row shows the status word instead. */
  readonly elapsed?: string
}

/** The `Last run` block of the idle state. */
export type RunSummary = {
  /**
   * The artboard shows `completed`; `failed` reuses `statusColors.failed` for the dot.
   *
   * **`cancelled` is the third arm, for the same reason `RunDockStatus` and
   * `RunHistoryEntry['status']` carry one (R7).** This block prints the status as a *word*, so
   * collapsing a cancelled run into `failed` here told a user who stopped the run themselves that
   * it had failed — while the dock header, the history row and the toast beside it all said
   * otherwise. No artboard draws it, and its treatment is the one the rest of the app already
   * chose: the muted `cancelled` dot rather than the error one.
   */
  readonly status: 'completed' | 'failed' | 'cancelled'
  /** e.g. `2.4s`. */
  readonly totalElapsed: string
  readonly nodeCount: number
  readonly timings: readonly RunNodeTiming[]
}

export type RunLogLine = {
  /** The mono timestamp, e.g. `0.00`. Rendered in `textColors.faintest`. */
  readonly time: string
  readonly text: string
}

export type RunLog = {
  readonly lines: readonly RunLogLine[]
  /** The unsettled line, rendered after a pulsing 3px accent caret. */
  readonly pending?: string
  /** The right-hand mono label of the `Live log` header. The artboard reads `follow`. */
  readonly followLabel?: string
}

export type RunErrorDetail = {
  /** The tagged error name, e.g. `ImageRenderError`. */
  readonly name: string
  /** The node the error belongs to, e.g. `render`. */
  readonly nodeId: string
  /** The safe message. Never a raw cause chain — P10 and P13 produce this payload. */
  readonly message: string
}

/**
 * One trimmed stack frame. Structurally identical to `StackFrame` in
 * `packages/core/src/errors.ts`; it is declared again here because `@jobik/ui` imports only the two
 * browser-safe core types, and `errors.ts` is a runtime module. P14 assigns the wire payload across
 * unchanged.
 */
export type RunStackFrame = { readonly fn: string; readonly file: string; readonly line: number }

export type RunStack = {
  readonly frames: readonly RunStackFrame[]
  /** The remainder the server did not send. `0` renders no hidden-frame line. */
  readonly hiddenFrames: number
}

/**
 * How a `string` or `json` control is drawn. The artboard shows `title` as a single line and
 * `markdown` as a 118px monospace area; `InputFieldDescriptor` carries no signal that separates
 * them, so the caller says which. Default `'line'`; a `json` control is always `'area'`.
 */
export type RunInputPresentation = 'line' | 'area'

/** What a DOM control produces. Numbers, enums and JSON arrive as their raw text. */
export type RunInputDraftValue = string | boolean

export type RunInputDraft = Readonly<Record<string, RunInputDraftValue>>

export type RunInputUpload = {
  readonly accept: string
  readonly maxBytes: number
  readonly uploading: boolean
  readonly previewUrl?: string
  readonly fileName?: string
  readonly message?: string
  readonly onSelect: (file: File) => void
}

/** One validation problem, flattened. Structurally `SchemaIssue` in `packages/core/src/errors.ts`. */
export type RunInputIssue = { readonly path: string; readonly message: string }

/**
 * The entry point is chosen from the sidebar's `Start` section or by clicking a start node on the
 * canvas — both call the model's `inputs.selectStart` directly, so the panel itself carries no
 * chooser and no `startIds`/`onSelectStart` pair. Those two surfaces are always on screen
 * regardless of which panel state is showing, which is also what F07 wanted: the entry point stays
 * reachable through every state, not just while the panel happens to be idle.
 */
export type RunIdleState = {
  readonly uploads?: Readonly<Record<string, RunInputUpload>>
  readonly kind: 'idle'
  /** The start the panel is pointed at. */
  readonly entryNodeId: string
  /**
   * `3D`'s invalid-board caption, stated in prose and drawn nowhere: *"Run is disabled while any
   * error stands."* `3B`'s treatment — the button drops to 45 % and changes nothing else, and
   * stops responding. The caller owns the predicate; this panel never counts findings of its own.
   */
  readonly blocked?: boolean
  /** The explanatory line. The artboard reads `Inputs are typed from the flow declaration. Only
   *  downstream nodes of the selected entry point run.` */
  readonly note: string
  /** P6's `deriveInputControls` output for the selected start. */
  readonly descriptor: NodeInputDescriptor
  /** The start's ORIGINAL Zod schema. P6's descriptors are pure JSON and carry no schema, so
   *  validation before a run or a save needs it here. Used type-only — never imported at runtime. */
  readonly input: z.ZodObject
  readonly draft: RunInputDraft
  readonly onDraftChange?: (field: string, value: RunInputDraftValue) => void
  readonly presentation?: Readonly<Record<string, RunInputPresentation>>
  /** Fired with the parsed, schema-valid values. Never fired when validation fails. */
  readonly onRun?: (values: Record<string, unknown>) => void
  /**
   * The `z.ZodError` or `SyntaxError` that stopped the run, handed to the caller so it can decide
   * what stands and for how long. The panel draws nothing off this — it draws `issues`, which the
   * caller supplies — because the other four run affordances live outside this component and must
   * be able to report onto the same surface.
   */
  readonly onInvalid?: (error: Error) => void
  /**
   * The validation problems that currently stand against this draft, flattened by
   * `toRunInputIssues`. Empty or absent draws nothing at all, which is every artboard.
   *
   * **The design has no surface for a rejected run input.** No artboard draws an error border on a
   * control, a caption under one, a required marker, a blocked `Run` button, or a pre-flight
   * banner: the run panel's inputs have exactly one skin and the file never varies it. So this
   * borrows the panel's own — and the design's only — treatment for a validation finding: the
   * error well the `Run panel — states` failed card draws (`#2a1f1e` on `#0d0b0b`, a mono tag in
   * `#dc8577`, a sentence in `#a79b98`), which is the same recipe `3C`'s Validation modal gives a
   * finding card. Nothing new is invented; the block simply appears in the panel that owns the
   * inputs, above the button that was pressed.
   *
   * Controlled rather than held here on purpose. `RunIdleView`'s own button is one of five ways to
   * start a run; the other four are the caller's, and a finding held privately here could never be
   * shown for them.
   */
  readonly issues?: readonly RunInputIssue[]
  readonly lastRun?: RunSummary
}

export type RunRunningState = {
  readonly kind: 'running'
  readonly runNumber: number
  /** e.g. `1.3s`. */
  readonly elapsed: string
  readonly completedNodes: number
  readonly totalNodes: number
  /** `0`–`1`. Independent of the node counts: the artboard shows `54%` beside `1 of 3`. */
  readonly progress: number
  /** The explanatory line from the `Run panel — states` card. Omitted renders no line. */
  readonly note?: string
  readonly nodes: readonly RunNodeTiming[]
  readonly log?: RunLog
  /** Renders the shimmering `Partial output` well from the `Run panel — states` card. */
  readonly partialOutput?: boolean
  readonly onCancel?: () => void
}

export type RunSavedSnapshot = {
  readonly runId?: string
  readonly startId: string
  readonly input: unknown
  readonly document?: FlowDocument
  readonly revision?: string
}

export type RunFailedState = {
  readonly snapshot?: RunSavedSnapshot
  readonly storageWarning?: string
  readonly blocked?: boolean
  readonly kind: 'failed'
  readonly runNumber: number
  /** e.g. `0.8s`. */
  readonly elapsed: string
  /** The start the panel is pointed at. Optional because this state draws no entry name of its
   *  own — `Re-run` is the whole label. */
  readonly entryNodeId?: string
  readonly error: RunErrorDetail
  /**
   * R7 — the run settled because the user cancelled it, not because it broke.
   *
   * It is a flag on this state rather than a fifth `kind` because the *body* is unchanged: a
   * cancelled run has an error payload (`RunCancelledError`), node timings, a log to copy and a
   * `Re-run`, which is exactly this card. Only the header's word and tone differ, and that is the
   * whole of what the flag moves — see `RunStateHeader` and `shell/RunDock`'s `RunDockStatus`.
   * Absent means failed, which is what every caller that never cancels a run already says.
   */
  readonly cancelled?: boolean
  readonly nodes: readonly RunNodeTiming[]
  readonly stack?: RunStack
  /**
   * The inputs that produced this failure, still editable — `RunCompletedState.inputs`'s own
   * reach-back, given to the failed card too. Without it there was no way from this card back to
   * the values that caused the error: `Re-run` only ever resubmitted them unchanged.
   */
  readonly inputs?: RunInputForm
  readonly onCopyLog?: () => void
  readonly onRerun?: () => void
}

/**
 * The typed input form, as `2A`'s completed dock re-shows it: the same controls the idle state
 * draws, above `Re-run <start>`. Declared separately from `RunIdleState`'s own fields because the
 * completed dock needs no `z.ZodObject` — it never validates, it hands the draft back to the caller
 * whose `Re-run` re-enters the idle path.
 */
export type RunInputForm = {
  readonly uploads?: Readonly<Record<string, RunInputUpload>>
  readonly descriptor: NodeInputDescriptor
  readonly draft: RunInputDraft
  readonly presentation?: Readonly<Record<string, RunInputPresentation>>
  readonly onDraftChange?: (field: string, value: RunInputDraftValue) => void
}

export type RunCompletedState = {
  readonly snapshot?: RunSavedSnapshot
  readonly storageWarning?: string
  readonly blocked?: boolean
  readonly kind: 'completed'
  readonly runNumber: number
  /** e.g. `2.4s`. */
  readonly elapsed: string
  readonly nodes: readonly RunNodeTiming[]
  /** `2A`: the primary reads `Re-run start1`. Omitted draws no primary at all. */
  readonly entryNodeId?: string
  /** `2A`: `title` and `markdown`, still shown and still editable, above the primary. */
  readonly inputs?: RunInputForm
  /** `2A`: the `Log` / `tail` block that closes the panel. */
  readonly log?: RunLog
  readonly onRerun?: () => void
}

/**
 * Which of the two running artboards the panel is drawn as. `dock` is `Studio — run in progress`
 * (the 320px right column of a live shell); `card` is the free-standing 320×430 `Run panel —
 * states` card. Only the running state differs between them.
 */
export type RunPanelVariant = 'dock' | 'card'

export type RunPanelState = RunIdleState | RunRunningState | RunFailedState | RunCompletedState
