import { computed } from '@reatom/core'
import { reatomCanvas } from './canvas.js'
import { reatomDraft } from './draft.js'
import { reatomExtension } from './extension.js'
import { reatomFlowSwitch } from './flowSwitch.js'
import { reatomFlows } from './flows.js'
import { reatomInputs } from './inputs.js'
import { reatomOutput } from './output.js'
import { reatomRun } from './run.js'
import { reatomRunPanel } from './runPanel.js'
import { reatomSave } from './save.js'
import { reatomShortcuts } from './shortcuts.js'
import type { StudioDeps, StudioModel } from './types.js'
import { reatomValidation } from './validation.js'

/**
 * The composition root of `@jobik/ui`'s Reatom model.
 *
 * One call builds one Studio: every sub-model, named from the root `name` that is passed in
 * (RTM-S05), wired in the order {@link StudioModel}'s own doc comment fixes. Nothing here is a
 * singleton and nothing is module-level state, so a test builds as many as it likes and each is
 * disposed with the frame it was created in.
 *
 * **This file is only wiring.** Every line below is a factory call or an argument to one; there is
 * one derivation in it, and its whole job is to break a cycle. Behaviour that looks like it belongs
 * here — closing the output viewer when the panel is pointed at another start, resetting eleven
 * sub-models on a flow switch — is a sub-model's, reached by handing that sub-model the unit it
 * needs. That is the rule the wave order depends on: a sub-model file never imports a sibling, so
 * the twelve could be written in parallel, and this is the one place that holds the instances.
 *
 * ## The cycles, and the one forwarder that breaks them
 *
 * Two cycles are real in the graph, and were real in the hook too — React's single closure hid
 * them:
 *
 *  * `draft`, `save`, `inputs` and `validation` all guard on `locked`, which is `run.running`;
 *    and `run` needs `draft.savedDocument` and `inputs.startId`.
 *  * `run.start` refuses while `validation.blocked`; and `validation.validate` refuses while
 *    `locked`.
 *
 * Both back-edges are the *same* edge — everything wired above `run` wanting `run.running` — so
 * {@link locked} is the whole of the break: a `computed` declared before the models that consume
 * it, whose body does not run until something reads it, by which time `run` is assigned. The
 * forward halves need nothing: `draft.savedDocument` and `inputs.startId` are built before `run`
 * reads them, and so is `validation.blocked`, which is why `run` and `runPanel` take that one
 * straight rather than through a second forwarder. The forwarder lives here and nowhere else.
 */
export function reatomStudio(deps: StudioDeps, name = 'studio'): StudioModel {
  const flows = reatomFlows(deps, `${name}.flows`)

  /**
   * The draft lock a run holds — `run.running`, forwarded to the four sub-models that guard on it.
   *
   * It is declared before `run` and reads it from inside a `computed` body, which is the whole
   * mechanism: nothing evaluates until a surface asks, and by then the assignment below has
   * happened. A sub-model receiving `run.running` directly would be a module importing a sibling's
   * instance, which is the thing this layer is arranged to avoid.
   */
  const locked = computed(() => run.running(), `${name}.locked`)

  const draft = reatomDraft(deps, { loaded: flows.loaded, locked }, `${name}.draft`)

  const save = reatomSave(
    deps,
    {
      flowId: flows.flowId,
      draft: draft.draft,
      markSaved: draft.markSaved,
      locked,
    },
    `${name}.save`,
  )

  const inputs = reatomInputs(
    deps,
    { descriptor: flows.descriptor, loaded: flows.loaded, locked },
    `${name}.inputs`,
  )

  const validation = reatomValidation(
    deps,
    {
      flowId: flows.flowId,
      document: draft.document,
      descriptor: flows.descriptor,
      locked,
    },
    `${name}.validation`,
  )

  const extension = reatomExtension(deps, { flowId: flows.flowId }, `${name}.extension`)

  const run = reatomRun(
    deps,
    {
      flowId: flows.flowId,
      descriptor: flows.descriptor,
      startId: inputs.startId,
      // The server executes what is on disk: an unsaved edit moves the canvas, not the run.
      savedDocument: draft.savedDocument,
      inputValues: inputs.values,
      inputIssues: inputs.issues,
      blocked: validation.blocked,
    },
    `${name}.run`,
  )

  const output = reatomOutput(
    deps,
    {
      descriptor: flows.descriptor,
      // The three things that close an open viewer, all of them derivations: the panel moving to
      // another start, a run beginning, and the run on screen changing.
      startId: inputs.startId,
      viewedSession: run.viewedSession,
      viewedReport: run.viewedReport,
      start: run.start,
    },
    `${name}.output`,
  )

  /**
   * Built **before** `canvas`, and that order is load-bearing rather than incidental: the failed
   * node card's `View trace` opens `3C`'s Stack trace dialog, which is `runPanel.openTrace`, so the
   * canvas names a unit this factory returns. Nothing runs the other way — `reatomRunPanel` takes
   * `descriptor`, `inputs`, `run` and `blocked`, all of them wired above — so moving it up needs no
   * forwarder and closes the only edge that would have wanted one.
   */
  const runPanel = reatomRunPanel(
    deps,
    { descriptor: flows.descriptor, inputs, run, blocked: validation.blocked },
    `${name}.runPanel`,
  )

  const canvas = reatomCanvas(
    deps,
    {
      descriptor: flows.descriptor,
      document: draft.document,
      selectedNodeId: inputs.selectedNodeId,
      problems: validation.problems,
      viewedSession: run.viewedSession,
      running: run.running,
      retry: run.retry,
      retryNode: run.retryNode,
      extension: extension.descriptor,
      openOutput: output.open,
      openTrace: runPanel.openTrace,
    },
    `${name}.canvas`,
  )

  /**
   * The one sub-model that takes whole sub-models: `switchTo` is the single place that calls every
   * `reset`, and the order it calls them in — every reset, *then* `flows.selectFlow` — is what makes
   * mount, switch and reload all seed correctly.
   */
  const flowSwitch = reatomFlowSwitch(
    deps,
    { flows, draft, save, inputs, validation, extension, run, output },
    `${name}.flowSwitch`,
  )

  const shortcuts = reatomShortcuts(deps, { run, save, validation, output }, `${name}.shortcuts`)

  return {
    deps,
    flows,
    draft,
    save,
    inputs,
    validation,
    extension,
    run,
    output,
    canvas,
    runPanel,
    flowSwitch,
    shortcuts,
  }
}
