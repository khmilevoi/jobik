import type { FlowDocument } from '@jobik/core'
import type { Action, AsyncDataExt, AsyncExt, Atom, Computed } from '@reatom/core'
import type { ReactNode } from 'react'
import type * as z from 'zod'
import type {
  FieldConnection,
  FieldEdgeTone,
  FlowCanvasEdge,
  FlowCanvasNode,
  NodeLayoutChange,
} from '#canvas/index.js'
import type {
  FlowListItem,
  JobikClient,
  LoadedFlowPayload,
  SafeFlowDescriptorPayload,
  SafeNodeDescriptorPayload,
  WireErrorPayload,
  WireNodeReportPayload,
  WireRunReportPayload,
} from '#client/index.js'
import { JobikServerError } from '#client/index.js'
import type { SwitchFlowBody, ValidationFinding } from '#modals/index.js'
import type { FlowUiDescriptor } from '#output/index.js'
import type { CopyState, DownloadState, ValidateState } from '#primitives/index.js'
import type {
  RunInputDraft,
  RunInputDraftValue,
  RunInputIssue,
  RunInputPresentation,
  RunPanelState,
} from '#run/index.js'
import type {
  RunDockMetaTone,
  RunDockStatus,
  RunHistoryEntry,
  TopBarValidateState,
} from '#shell/index.js'
import type { FlowDraft } from '#studio/draft.js'
import type { ExternalModules } from '#studio/extensionLoader.js'
import type { NodeOverlay } from '#studio/graphModel.js'
import type { FlowProblemModel } from '#studio/problems.js'
import type { RunSession } from '#studio/runSession.js'

/**
 * The shared contract for `@jobik/ui`'s Reatom model layer.
 *
 * This file is a **coordination artifact**, not a place where behaviour lives. It declares one
 * interface per sub-model — the units that module owns and their types — and each factory's
 * signature, so the modules can be written in parallel without any of them reading another's
 * source. Every member was derived from what `studio/useStudioSession.ts` returned and what
 * `studio/StudioApp/StudioApp.tsx` consumes; nothing was designed anew. That hook is gone — the
 * model below is what replaced it — so where a doc comment cites a rule (`F02`, `F07`, `F10`,
 * `R25`, `R35`, `8-A`, `8-B`, `3B`, `3C`, `3D`, `3F`), the sentence it summarises now lives in the
 * sub-model that owns the behaviour, and that module is the authority.
 *
 * ## Conventions every implementer must follow
 *
 * **Absence is `undefined`, never `null`.** Every existing type in this package spells it that way
 * — `FlowDraft | undefined`, `RunSession | undefined`, `SafeFlowDescriptorPayload | undefined` —
 * and the presentational props these models feed are typed the same. `atom(undefined)` infers
 * `Atom<undefined>`, so state the parameter: `atom<string | undefined>(undefined, name)`.
 *
 * **Name every unit (RTM-S05).** A factory derives its unit names from the `name` it is handed —
 * `` `${name}.draft` `` — and a per-instance unit adds `#id`:
 * `` `${name}.node#${nodeId}.overlay` ``. Internal units that are not on the interface take a
 * leading `_`.
 *
 * **Errors stay values.** `JobikClient` methods return `T | Error` and never reject; the only throw
 * in the whole client is `NdjsonParseError` while iterating the `startRun` generator. So an async
 * unit's data type is `T | Error` and callers narrow with `instanceof Error`. Never convert an
 * expected failure into a throw so that `withAsync().error()` can catch it — `.error()` is for
 * genuinely unexpected throws. `withAsync`/`withAsyncData` still earn their place for `.ready()`
 * (RTM-A02), which is what {@link AsyncData} and {@link AsyncAction} below are for.
 *
 * **Read reactive inputs before the first `await` (RTM-A07).** Several of the actions declared here
 * were `useCallback`s whose dependency list did that job; a read placed after an `await` never
 * becomes a dependency.
 */

/**
 * A `computed(async …)` extended with `withAsyncData()`.
 *
 * `AsyncDataExt` is not an `AtomLike`, so `extend`'s `Merge` yields the intersection written out
 * here. `.data()` is `T | undefined` until the first answer lands, and `T` is itself a
 * `Payload | Error` union under the error policy above.
 */
export type AsyncData<T> = Computed<Promise<T>> & AsyncDataExt<[], T, T, undefined>

/**
 * An `action(async …)` extended with `withAsync()`.
 *
 * Declared for `.ready()` (RTM-A02), which a caller asks instead of keeping a `saving` boolean
 * beside the action. `.error()` is deliberately on no interface below: an expected failure is a
 * value, and the states the UI actually renders are {@link SaveState} and {@link ValidationState}.
 */
export type AsyncAction<Params extends unknown[], Payload = void> = Action<
  Params,
  Promise<Payload>
> &
  AsyncExt<Params, Payload>

/**
 * Everything the model layer needs from outside itself.
 *
 * Derived from `StudioAppProps` and the argument object the old `useStudioSession` hook took:
 * `client` is required (`StudioApp` defaults it to `createJobikClient` before the model is ever
 * built), `externals` and `importModule` are the live module namespaces a flow-local
 * `flow.ui.tsx` bundle may import, and `now` is the injected clock every test drives instead of
 * `Date.now`.
 *
 * R29 is gone rather than ported: `externals` and `importModule` were read through refs because
 * `StudioApp` passed fresh literals every render and re-rendered every 100ms during a run. A Reatom
 * model has no render, so they are plain fields and that hazard cannot recur.
 */
export interface StudioDeps {
  readonly client: JobikClient
  /** The live module namespaces a flow-local `flow.ui.tsx` bundle may import. */
  readonly externals?: ExternalModules
  readonly importModule?: (url: string) => Promise<unknown>
  /** The clock. Defaults to `Date.now`; every test supplies its own. */
  readonly now?: () => number
}

/**
 * What a save is doing, or what it found — `idle | saving | conflict | error`.
 *
 * Defined here. It was `studio/useStudioSession.ts`'s until the wave that deleted that file moved
 * it in verbatim, and this file has been its only home since.
 *
 * **Not an RTM-A03 violation.** RTM-A03 objects to a hand-rolled `loading`/`error` pair beside an
 * async unit, which `withAsync` already models. `SaveState` is a domain state with four
 * distinguishable arms the UI renders differently — `conflict` carries the two revisions the
 * `## UI and persistence` offer needs, `error` carries the server's own `WireErrorPayload` — and a
 * boolean `.ready()` plus an `.error()` cannot represent it. It stays exactly as it is.
 *
 * The same reading covers `ValidationState` (`checking | valid | invalid | unreachable`), where
 * `unreachable` is kept apart from `invalid` on purpose: the first means the check never ran, the
 * second that it ran and rejected the document, and the `Validation` dialog must not present a
 * transport failure as a finding about the flow. It also covers the run's own
 * `failure: WireErrorPayload` on `RunSession`, which R25 makes the single surface every failure
 * lands on and which the panel renders as `kind: 'failed'`.
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

/**
 * `3B`'s retry, as `StudioApp` holds it today: which card, and the failure still shown on it.
 *
 * The engine runs a whole flow from a start; there is no re-execution of a single node. So
 * `Retry node` starts exactly the run `Re-run` starts, and this is what lets the card keep saying
 * what it is retrying *from* — the error is carried rather than looked up, because the run that
 * produced it is gone from `session` the moment the new one replaces it.
 *
 * This is now the only declaration of it: `StudioApp.tsx` held an identical module-private copy
 * until the wave that made that file read the model, and the two collapsed into this one.
 */
export interface RetryState {
  readonly nodeId: string
  readonly errorName: string
  readonly message: ReactNode
}

/**
 * Turns any `Error` the client can hand back into the `WireErrorPayload` shape the run panel
 * renders.
 *
 * A `JobikServerError`'s `.payload` is exactly what the server sent and passes through untouched —
 * never re-tagged, never re-humanised. Anything else (a `JobikTransportError`, an
 * `NdjsonParseError`) has no server payload, so it surfaces honestly as what it is: its own `_tag`
 * when it is a tagged error, and its own message.
 *
 * It lives here rather than in `model/run.ts` so that `model/run.ts` is a file exactly one agent
 * creates. Behaviour is unchanged from the copy that was private to `useStudioSession.ts`, and
 * this is the only copy left.
 */
export function toFailurePayload(error: Error): WireErrorPayload {
  if (error instanceof JobikServerError) return error.payload
  const tag = (error as { _tag?: unknown })._tag
  return { _tag: typeof tag === 'string' ? tag : null, message: error.message }
}

/**
 * Flow discovery, the flow the Studio is pointed at, and the document behind it.
 *
 * `reatomFlows(deps: StudioDeps, name: string): FlowsModel`
 *
 * It takes nothing but `deps`: it is the root of the graph, and every other sub-model reads from it.
 *
 * Discovery and load stay two units, for the reason R5 gives: one unit that read `flowId`, set it,
 * and listed `flowId` among its own dependencies double-fired on mount. `loaded` is keyed on
 * `flowId` and is the only thing that fetches a flow.
 */
export interface FlowsModel {
  /** `client.listFlows()`, once. */
  readonly list: AsyncData<readonly FlowListItem[] | Error>
  /** The listing the sidebar draws — `list.data()` narrowed; empty while absent or failed. */
  readonly flows: Computed<readonly FlowListItem[]>
  /** The flow the whole Studio is pointed at. Seeded by discovery from `list`. */
  readonly flowId: Atom<string | undefined>
  /** `GET /api/flows/:id`, keyed on `flowId`. The document and the descriptor arrive together. */
  readonly loaded: AsyncData<LoadedFlowPayload | Error>
  /** `loaded` narrowed to the descriptor. `undefined` while loading and on a failed load. */
  readonly descriptor: Computed<SafeFlowDescriptorPayload | undefined>
  /**
   * `## UI and persistence`'s other half of the conflict offer: take what is on disk.
   *
   * It resolves a **document** conflict, and the draft is the whole of what it discards. The typed
   * run inputs and the start they belong to survive it — {@link InputsModel} holds the F10
   * predicate that decides.
   */
  readonly reloadFromDisk: Action<[], void>
  /**
   * Points the whole Studio at another flow. Immediate and never blocked — not by a dirty draft and
   * not by a run in flight. Asking a question first is a surface, and it belongs to
   * {@link FlowSwitchModel}, not here.
   */
  readonly selectFlow: Action<[flowId: string], void>
}

/**
 * The in-memory draft: dirty after an edit, written only on Save.
 *
 * `reatomDraft(deps: StudioDeps, input: { loaded: FlowsModel['loaded']; locked: Computed<boolean> },
 * name: string): DraftModel`
 *
 * `locked` is `RunModel.running` — the draft lock a run holds. See the note on cycles at
 * {@link StudioModel}.
 *
 * The draft is writable state derived from `loaded`, which is `withComputed`'s case (RTM-S02): a
 * landed load seeds a fresh `createDraft(document, revision)`, and an edit writes over it until the
 * next load.
 */
export interface DraftModel {
  readonly draft: Atom<FlowDraft | undefined>
  readonly document: Computed<FlowDocument | undefined>
  /**
   * The document as it stands on disk. Separate because the run graph depends on it and it changes
   * only on a load or a save, while `document` gets a new identity on every drag.
   */
  readonly savedDocument: Computed<FlowDocument | undefined>
  readonly dirty: Computed<boolean>
  /** `3F`'s `<n> unsaved changes`. `unsavedChangeCount` in `studio/draft.ts`. */
  readonly unsavedChanges: Computed<number>
  /** Ignored while `locked`. */
  readonly moveNode: Action<[change: NodeLayoutChange], void>
  /** Ignored while `locked`. */
  readonly connect: Action<[connection: FieldConnection], void>
  /**
   * R18: `markSaved` compares the document it is given against whatever the draft holds now, by
   * identity — an edit that landed while the write was in flight keeps the draft dirty rather than
   * being silently overwritten. {@link SaveModel} is its only caller.
   */
  readonly markSaved: Action<[document: FlowDocument, revision: string], void>
  /** The conflict offer's second answer: the draft document, pretty-printed, to the clipboard. */
  readonly copyDraft: Action<[], void>
  /** Drops the draft. {@link FlowSwitchModel} calls it as one part of one flow switch. */
  readonly reset: Action<[], void>
}

/**
 * Writing the draft to disk, and the conflict it can come back with.
 *
 * `reatomSave(deps: StudioDeps, input: { flowId: Atom<string | undefined>; draft: Atom<FlowDraft |
 * undefined>; markSaved: DraftModel['markSaved']; locked: Computed<boolean> }, name: string):
 * SaveModel`
 *
 * `save` refuses while `locked`, with no `flowId`, and with no draft. It has no re-entrancy guard
 * of its own today and `3F`'s `Save and switch` supplies one by hand; `.ready()` is where that
 * belongs once this is a Reatom action.
 */
export interface SaveModel {
  readonly state: Atom<SaveState>
  /**
   * `## UI and persistence`: on a revision conflict, offer reload or copy-draft. Never overwrite,
   * and never retry with the revision the server reported.
   */
  readonly save: AsyncAction<[], void>
  readonly reset: Action<[], void>
}

/**
 * The selected start, the typed run inputs, and what the last press found wrong with them.
 *
 * `reatomInputs(deps: StudioDeps, input: { descriptor: Computed<SafeFlowDescriptorPayload |
 * undefined>; loaded: FlowsModel['loaded']; locked: Computed<boolean> }, name: string): InputsModel`
 *
 * **F10, and why `loaded` is an input rather than `descriptor` alone.** Every landed load runs
 * `keepsRunSelection(previous, next)`: the selected start must still be declared, still have a
 * node, and still carry the same input descriptor. That one predicate reproduces all three
 * behaviours the hook had, because {@link FlowSwitchModel} clears `startId` before the new flow's
 * load lands — a mount load and a flow switch both see `startId === undefined` and re-seed, while a
 * reload sees a live selection and keeps every typed character.
 */
export interface InputsModel {
  /**
   * The start the run panel and the canvas are pointed at — one of `descriptor.startIds`, seeded
   * with the first and moved by `selectStart`.
   */
  readonly startId: Atom<string | undefined>
  /**
   * The node the canvas and sidebar mark. `seedStart` is its only writer, so it always holds
   * `startId`; a predicate that keeps `startId` valid keeps this valid too.
   */
  readonly selectedNodeId: Atom<string | undefined>
  readonly startNode: Computed<SafeNodeDescriptorPayload | undefined>
  readonly inputDraft: Atom<RunInputDraft>
  /**
   * `toRunInputSchema(startNode.input)` — the browser's pre-check. It must never be stricter than
   * the server's, which re-validates every run.
   */
  readonly schema: Computed<z.ZodObject | undefined>
  readonly presentation: Computed<Readonly<Record<string, RunInputPresentation>> | undefined>
  /**
   * F02 — what the last press found wrong with the draft. Held here rather than inside
   * `RunIdleView` because four of the five run affordances are not the panel's.
   */
  readonly issues: Atom<readonly RunInputIssue[] | undefined>
  /** Ignored while `locked`. A keystroke retires whatever the last press found. */
  readonly setInputField: Action<[field: string, value: RunInputDraftValue], void>
  /**
   * Points the panel at another declared start, re-seeding the draft from that start's own
   * descriptor. Ignored while `locked`, and ignored for an id the descriptor does not declare.
   */
  readonly selectStart: Action<[startId: string], void>
  /** The three writes choosing a start means: the id, the marked node, the seeded draft. */
  readonly seedStart: Action<
    [descriptor: SafeFlowDescriptorPayload, startId: string | undefined],
    void
  >
  /**
   * R35/F02 — the one place the input draft becomes run values. Returns `undefined` and files the
   * finding on `issues` when the draft does not satisfy the schema, so every affordance reports
   * onto one surface instead of failing silently.
   */
  readonly values: Action<[], Record<string, unknown> | undefined>
  /** `RunIdleView.onInvalid`: the panel's own button validates inside `run/` and reports here. */
  readonly reportInvalid: Action<[error: Error], void>
  readonly reset: Action<[], void>
}

/**
 * `validate()`'s answer, the findings derived from it, and the chip that reports it.
 *
 * `reatomValidation(deps: StudioDeps, input: { flowId: Atom<string | undefined>; document:
 * Computed<FlowDocument | undefined>; descriptor: Computed<SafeFlowDescriptorPayload | undefined>;
 * locked: Computed<boolean> }, name: string): ValidationModel`
 */
export interface ValidationModel {
  /** The raw answer, as it landed. */
  readonly state: Atom<ValidationState | undefined>
  /** The document `state` was produced for. Captured at the press, not when the answer lands. */
  readonly validatedFor: Atom<FlowDocument | undefined>
  /**
   * `3D` — the result, withheld once the flow it describes no longer exists. Derived through
   * `sameFlowShape`, which ignores `layout`, so dragging a card does not throw away a report the
   * user is still reading. A derivation, not an effect: no frame shows a stale result.
   */
  readonly active: Computed<ValidationState | undefined>
  /** `3D`'s strip rows, node and port marks, and failing edge — all from the one wire finding. */
  readonly problems: Computed<FlowProblemModel>
  readonly errorCount: Computed<number>
  /**
   * `3D`: *"Run is disabled while any error stands; warnings never block it."* Counted off the
   * findings rather than off `state.kind`, so a warning the wire learns to send never blocks a run
   * by accident.
   */
  readonly blocked: Computed<boolean>
  /** `3C`'s Validation dialog rows. `undefined` unless the last answer rejected the document. */
  readonly findings: Computed<readonly ValidationFinding[] | undefined>
  /**
   * What the dialog draws: `findings`, held across the `checking` phase its own `Re-validate`
   * starts, so `3C` rule 04's *"the modal stays open until the work settles"* has rows to stand on.
   */
  readonly reportFindings: Atom<readonly ValidationFinding[] | undefined>
  /**
   * `idle → checking → valid|invalid → idle`, with `3D`'s 4 s hold on the resolved chip. Ports
   * `createValidateAction` from `primitives/actionState.ts` — which is still there, and is now
   * called by nothing but its own suite, for the two cases the model has no way to reach. The hold
   * is a timer, so it needs a lifetime owner (RTM-L01) rather than a bare module-level `effect`.
   */
  readonly chip: Atom<ValidateState>
  /** The top bar's cell. `invalid` needs a count, so a state that lost its findings falls to `idle`. */
  readonly topBar: Computed<TopBarValidateState>
  /** `3C`'s dialog is a surface of its own: dismissing it must not throw the findings away. */
  readonly reportOpen: Atom<boolean>
  /** `3A` §4.1's four cells for the dialog's `Copy report`. */
  readonly copyState: Atom<CopyState>
  /** Ignored while `locked`, and while a check is already running or a result still stands. */
  readonly validate: Action<[], void>
  /**
   * `3C` rule 04's `Re-validate`. Same request, without `3D`'s four-second chip hold — that rule
   * belongs to the top-bar control, and inside the dialog it makes the primary action a no-op for
   * the exact window in which it is pressed. Refused only while a check is already out.
   */
  readonly revalidate: Action<[], void>
  /** `3C` §2's footer ghost: the dialog's own rows to the clipboard, on `3A`'s copy matrix. */
  readonly copyReport: Action<[], void>
  readonly dismiss: Action<[], void>
  readonly openReport: Action<[], void>
  readonly closeReport: Action<[], void>
  readonly reset: Action<[], void>
}

/**
 * The flow-local `flow.ui.tsx` bundle.
 *
 * `reatomExtension(deps: StudioDeps, input: { flowId: Atom<string | undefined> }, name: string):
 * ExtensionModel`
 *
 * `## Flow-local output UI`: a failure is not an error state. An absent renderer falls back to the
 * generic JSON viewer, and so does a broken one — which is why `descriptor` narrows an `Error` to
 * `undefined` instead of surfacing it.
 */
export interface ExtensionModel {
  readonly bundle: AsyncData<FlowUiDescriptor | Error>
  readonly descriptor: Computed<FlowUiDescriptor | undefined>
  readonly reset: Action<[], void>
}

/**
 * The run: starting it, streaming it, cancelling it, and every run this tab has already made.
 *
 * `reatomRun(deps: StudioDeps, input: { flowId: Atom<string | undefined>; descriptor:
 * Computed<SafeFlowDescriptorPayload | undefined>; startId: Atom<string | undefined>;
 * savedDocument: Computed<FlowDocument | undefined>; inputValues: InputsModel['values'];
 * inputIssues: InputsModel['issues']; blocked: Computed<boolean> }, name: string): RunModel`
 *
 * `blocked` is `ValidationModel.blocked`; see the note on cycles at {@link StudioModel}.
 *
 * **The document to ask is `savedDocument`.** The server executes what is on disk and a dirty draft
 * does not block a run; an unsaved edit moves the canvas, not the run. The nodes one start can
 * actually execute come from `runGraphNodeIds`, which is a second implementation of core's
 * `resolveRunGraph` and is held to it by `model/runGraph.test.ts`.
 *
 * **R25 — every failure lands on `session.failure`.** A rejected start, a failed cancel, a
 * mid-stream parse error and a stream that ends without a terminal line all write the one surface
 * the run panel already renders as `kind: 'failed'`. 8-B narrows exactly one: a cancel whose
 * failure arrives after the run produced its own terminal line is dropped rather than written over
 * that outcome (`markCancelFailed`), and `run-settled` clears `failure` for the mirror case.
 *
 * **`generation` is the whole of "a run in flight must not corrupt the flow you switched to".** It
 * is read once, before the first `await`, and every write the run would make afterwards is gated on
 * it still matching. A flow switch bumps it, and so does the next start; the `for await` keeps
 * draining, so the server settles the run and nothing is orphaned.
 */
export interface RunModel {
  readonly session: Atom<RunSession | undefined>
  /**
   * Whether the stream is still open — not a projection of the run's outcome. It is the draft
   * lock's source, and it is what every other sub-model receives as `locked`.
   */
  readonly running: Atom<boolean>
  /** From the stream's first line. `POST /api/runs/:token/cancel` takes it. */
  readonly runToken: Atom<string | undefined>
  readonly startedAt: Atom<number>
  /** Bumped by a flow switch and by every start. See the note above. */
  readonly generation: Atom<number>
  /**
   * Ticks while a run is in flight; the settled elapsed time afterwards. The 100ms clock behind it
   * is a timer, so it needs a lifetime owner (RTM-L01).
   */
  readonly elapsedMs: Computed<number>
  /** Derived from `session`, never stored: settling is one transition and gets one write. */
  readonly lastReport: Computed<WireRunReportPayload | undefined>
  /**
   * `2A`'s `Run history`, from the runs this browser session has actually made. The whole settled
   * `RunSession` is kept, not a summary of one — every read-only surface is already a projection of
   * a session, so keeping the session is the whole feature. v1 has no endpoint that returns an
   * earlier run's report, so this lives exactly as long as the tab does. A run that never settled
   * has no report and no number, so it never joins.
   */
  readonly archive: Atom<readonly RunSession[]>
  /** The row the sidebar marks. `undefined` means the newest, which is the run on screen. */
  readonly selectedRunId: Atom<string | undefined>
  readonly history: Computed<readonly RunHistoryEntry[]>
  /** What a click picked, or the newest run when nothing did. */
  readonly activeRunId: Computed<string | undefined>
  /**
   * The run every read-only surface projects. A picked row wins, but only while nothing is in
   * flight: a live run owns the canvas and is the one run with no row of its own.
   */
  readonly viewedSession: Computed<RunSession | undefined>
  readonly viewedReport: Computed<WireRunReportPayload | undefined>
  /**
   * F07 — whether the settled run on screen is still a report about the start the panel is pointed
   * at. A row picked from `Run history` is the deliberate exception.
   */
  readonly settledRunIsCurrent: Computed<boolean>
  /** The node the `Cancel run` dialog names twice. The stream reports at most one at a time. */
  readonly runningNodeId: Computed<string | undefined>
  /** `3B` — the node whose `Retry node` was pressed, with the failure it is retrying from. */
  readonly retry: Atom<RetryState | undefined>
  /** `3C`: cancelling asks first. Every affordance opens the dialog; only its primary cancels. */
  readonly cancelPrompt: Atom<boolean>
  /**
   * Starts a run with values that already satisfied the schema. Refused while `blocked` (`3D`) and
   * while one is already in flight. Clears `selectedRunId`, `retry` and `inputIssues`: a new run
   * takes the surfaces over.
   */
  readonly start: AsyncAction<[values: Record<string, unknown>], void>
  /** `⌘↵`, the docked control, the top bar and a failed panel's `Re-run`: `values()` then `start`. */
  readonly runFromDraft: Action<[], void>
  /** `3B`: starts exactly the run `Re-run` starts, and records which card asked. */
  readonly retryNode: Action<[target: RetryState], void>
  readonly selectRun: Action<[runId: string], void>
  readonly askToCancel: Action<[], void>
  readonly keepRunning: Action<[], void>
  readonly confirmCancel: Action<[], void>
  /**
   * The stream is NOT closed here. `## Progress and cancellation`: the server settles the run with
   * the abort error and keeps already-settled node results, and that terminal line ends the run.
   */
  readonly cancel: AsyncAction<[], void>
  readonly reset: Action<[], void>
}

/**
 * The output viewer and the bottom output dock.
 *
 * `reatomOutput(deps: StudioDeps, input: { descriptor: Computed<SafeFlowDescriptorPayload |
 * undefined>; viewedSession: RunModel['viewedSession']; viewedReport: RunModel['viewedReport'];
 * start: RunModel['start'] }, name: string): OutputModel`
 *
 * `start` is an input so that this module can close the viewer when a run begins — the dependency
 * runs this way round on purpose, so `model/run.ts` never names an output unit. Without it the
 * viewer only appears to close, and silently reopens if the next report contains a node with the
 * same id.
 */
export interface OutputModel {
  readonly viewerNodeId: Atom<string | undefined>
  readonly openViewerNode: Computed<WireNodeReportPayload | undefined>
  /** `2A`'s two mono strings, both read off the report and the descriptor, never fabricated. */
  readonly dockStrings: Computed<{ readonly context: string; readonly summary: string } | undefined>
  readonly logs: Computed<readonly { readonly time: string; readonly message: string }[]>
  readonly open: Action<[nodeId: string], void>
  readonly close: Action<[], void>
  /** R33: acts on the payload the `Raw` tab renders, not on `close`. */
  readonly copyAll: Action<[], void>
  readonly download: Action<[], void>
  /**
   * `3A` §2 — `idle | busy | ok | failed`, the copy toolbar button's four cells. `failed` is
   * terminal until the next press.
   *
   * It is on the contract rather than beside it because the sequence runs on the model: what a copy
   * *does* is serialise the run report and write the clipboard, and only the model has a report. A
   * surface draws the cell and sends the press. This is not an RTM-A03 violation for the same reason
   * {@link SaveState} and {@link ValidationState} are not — `3A` fixes four cells the design draws
   * differently, and a boolean `.ready()` cannot represent them.
   */
  readonly copyState: Atom<CopyState>
  /**
   * `3A` §3 — `idle | busy | ok`, the indeterminate branch. `progress` is in the union and is
   * unreachable here: nothing on the wire carries a byte count, so the download is a spinner and
   * then `Saved`.
   */
  readonly downloadState: Atom<DownloadState>
  readonly reset: Action<[], void>
}

/**
 * The canvas arrays, and the overlays that decorate them.
 *
 * `reatomCanvas(deps: StudioDeps, input: { descriptor: Computed<SafeFlowDescriptorPayload |
 * undefined>; document: Computed<FlowDocument | undefined>; selectedNodeId: Atom<string |
 * undefined>; problems: ValidationModel['problems']; viewedSession: RunModel['viewedSession'];
 * running: Atom<boolean>; retry: Atom<RetryState | undefined>; retryNode: RunModel['retryNode'];
 * extension: ExtensionModel['descriptor']; openOutput: OutputModel['open'] }, name: string):
 * CanvasModel`
 *
 * **`nodes` and `edges` are keyed on the model INPUTS, never on the previous output.** `FlowCanvas`
 * re-syncs its internal React Flow state whenever either array's identity changes, so rebuilding
 * one on every read puts the canvas back to work on every stream frame. A `computed` gives that for
 * free; do not defeat it by reading a clock — the run's 100ms tick belongs in the dock header, not
 * in a node array.
 *
 * `NodeOverlay.outputSlot.content` is a `ReactNode`, so this module is a `.tsx` file.
 */
export interface CanvasModel {
  /**
   * Every seeded node's overlay in one value — for a surface that wants one read rather than a
   * subscription per card. Reading it is a subscription to every node's overlay by construction, so
   * a card reads {@link CanvasModel.nodeOverlay} instead.
   */
  readonly overlays: Computed<ReadonlyMap<string, NodeOverlay> | undefined>
  readonly nodes: Computed<readonly FlowCanvasNode[]>
  readonly edges: Computed<readonly FlowCanvasEdge[]>
  /**
   * One node's overlay, created on first ask and never rebuilt.
   *
   * On the interface rather than only on the factory's return type, because `NodeCard` reads its
   * own id here — and `nodes` carries no run state at all — and that pair *is* the refactor's
   * headline fix: a `node-status` line reaches the one card it is about, and an in-flight drag
   * survives a run. A surface that can only reach `StudioModel.canvas` must be able to ask.
   *
   * There used to be a `decoratedNodes` beside `nodes` — the same array with every overlay folded
   * back in — because the card read its run state off the object it was handed. It gave the array
   * a fresh identity on every stream frame, which is exactly the hazard `nodes` exists to remove,
   * and it went the day the card started asking here.
   */
  readonly nodeOverlay: (nodeId: string) => Computed<NodeOverlay | undefined>
  /**
   * The tone every edge pointing AT `nodeId` takes from the run, or `undefined` when the run has
   * nothing to say about it and the edge keeps `resolveEdgeTone`'s own derivation.
   *
   * `4A` coverage, Edge flow: *"the dashed 0.8 s march is a loop, not a transition, and stops the
   * moment the run ends."* `Studio — run in progress` draws it twice over — the accent marching
   * dash into the running node, the quiet static dash into the queued one.
   *
   * It is an accessor for the same reason `nodeOverlay` is. `FieldEdge` reads its own target's, so
   * a `node-status` line repaints the edges into that one node; the `edges` array stays structure
   * only, keeps its identity across a whole run, and the canvas never re-syncs because a run
   * moved.
   */
  readonly incomingEdgeTone: (nodeId: string) => Computed<FieldEdgeTone | undefined>
}

/**
 * The dock's body and its one header.
 *
 * `reatomRunPanel(deps: StudioDeps, input: { descriptor: Computed<SafeFlowDescriptorPayload |
 * undefined>; inputs: InputsModel; run: RunModel; blocked: ValidationModel['blocked'] }, name:
 * string): RunPanelModel`
 *
 * R9: the settled states are guarded on a session rather than fabricated. A settled run — streamed
 * or rejected outright — always leaves one populated by the time `running` goes back to `false`;
 * nothing here invents a `RunSession` shape to satisfy the compiler.
 */
export interface RunPanelModel {
  readonly state: Computed<RunPanelState | undefined>
  /** 8-A: the run number, in `RunDock`'s one header. `undefined` on idle, which draws none. */
  readonly meta: Computed<{ readonly text: string; readonly tone: RunDockMetaTone } | undefined>
  /** `2A`: once a run settles the header's left half becomes `● Completed` or `● Run failed`. */
  readonly dockStatus: Computed<RunDockStatus | undefined>
}

/**
 * `3F` — the switch that asks first, and the reset that follows an answer.
 *
 * `reatomFlowSwitch(deps: StudioDeps, input: { flows: FlowsModel; draft: DraftModel; save:
 * SaveModel; inputs: InputsModel; validation: ValidationModel; extension: ExtensionModel; run:
 * RunModel; output: OutputModel }, name: string): FlowSwitchModel`
 *
 * It takes whole sub-models because `switchTo` is the one place that calls every `reset` — the
 * transition `useStudioSession.selectFlow` and `StudioApp.switchTo` performed between them, in one
 * batch, so no frame paints one flow's state under another's id.
 *
 * **The guard is a surface, not a second kind of transition.** `flows.selectFlow` stays
 * unconditional; asking a question first is a modal, held-back state and an answer, and that is
 * what lives here. A clean draft with no run in flight loses nothing, so it goes straight through
 * and the common case never sees a dialog.
 */
export interface FlowSwitchModel {
  /** The flow whose row was pressed, held while the dialog stands. `undefined` is "no dialog". */
  readonly pendingFlowId: Atom<string | undefined>
  /** `Save and switch` cannot answer synchronously: the target parks here until `saveState` settles. */
  readonly saveAndSwitchTo: Atom<string | undefined>
  readonly pendingFlowName: Computed<string | undefined>
  /**
   * Which body `3F` draws, recomputed rather than frozen at the click. **A run in flight wins over
   * an unsaved draft**: `save()` refuses while a run streams, so an unsaved body offered there
   * would carry a primary that does nothing at all.
   */
  readonly body: Computed<SwitchFlowBody | undefined>
  /** What a sidebar flow row calls. Opens the dialog when the switch would lose something. */
  readonly requestFlow: Action<[flowId: string], void>
  /** The transition itself: every `reset`, then `flows.selectFlow`. */
  readonly switchTo: Action<[flowId: string], void>
  readonly stay: Action<[], void>
  /** `Switch and keep running` and `Discard changes`: one behaviour, two labels for what it costs. */
  readonly switchToPending: Action<[], void>
  /** Order is load-bearing: cancel first, because `switchTo` clears the token the request needs. */
  readonly cancelAndSwitch: Action<[], void>
  readonly saveAndSwitch: Action<[], void>
}

/**
 * The four global keys `RunPanel` renders and binds none of: `⌘↵`, `⌘⇧V`, `⌘S`, `esc`.
 *
 * `reatomShortcuts(deps: StudioDeps, input: { run: RunModel; save: SaveModel; validation:
 * ValidationModel; output: OutputModel }, name: string): ShortcutsModel`
 *
 * `esc` has a priority order, and it is behaviour rather than decoration: a modal that already
 * answered has called `preventDefault()` on the way up and is skipped; then the output viewer
 * closes; only then does a running run open the cancel dialog.
 */
export interface ShortcutsModel {
  /** The whole of the behaviour, and what a test drives directly. */
  readonly onKeyDown: Action<[event: KeyboardEvent], void>
  /**
   * True while the global `keydown` listener is installed. RTM-L01: the listener's lifetime belongs
   * to a connect hook that returns its own cleanup, never to a bare module-level `effect`.
   */
  readonly bound: Atom<boolean>
}

/**
 * Every sub-model, plus the dependencies they were all built from.
 *
 * `reatomStudio(deps: StudioDeps, name = 'studio'): StudioModel`
 *
 * ## Wiring order
 *
 * `flows → draft → save → inputs → validation → extension → run → output → canvas → runPanel →
 * flowSwitch → shortcuts`. Each factory's `input` names only units declared above it, with two
 * deliberate exceptions.
 *
 * ## The two cycles, and how `studio.ts` breaks them
 *
 * Both are real in the hook too — React's one closure hid them:
 *
 *  * `draft`, `save`, `inputs` and `validation` all guard on `locked`, which is `run.running`;
 *    and `run` needs `draft.savedDocument` and `inputs.startId`.
 *  * `run.start` refuses while `validation.blocked`; and `validation.validate` refuses while
 *    `locked`.
 *
 * `studio.ts` forwards each with a lazily-read `computed` declared before the models that consume
 * it: a `computed` body does not run until something reads it, by which time the sub-model it names
 * is assigned. **Both forwarders live in `studio.ts` alone** — no sub-model file ever imports
 * another's, which is what lets the modules be written in parallel.
 *
 * `deps` is on the model so a surface holding a `StudioModel` can reach `client.assetUrl` without a
 * second injection point; `StudioApp` passes that function down to every output component.
 */
export interface StudioModel {
  readonly deps: StudioDeps
  readonly flows: FlowsModel
  readonly draft: DraftModel
  readonly save: SaveModel
  readonly inputs: InputsModel
  readonly validation: ValidationModel
  readonly extension: ExtensionModel
  readonly run: RunModel
  readonly output: OutputModel
  readonly canvas: CanvasModel
  readonly runPanel: RunPanelModel
  readonly flowSwitch: FlowSwitchModel
  readonly shortcuts: ShortcutsModel
}

/** Every slot of {@link StudioModel} except `deps` — the twelve the wiring task fills, by name. */
export type StudioModelSlot = Exclude<keyof StudioModel, 'deps'>
