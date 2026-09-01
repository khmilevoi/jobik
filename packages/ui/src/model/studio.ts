import type { StudioDeps, StudioModel, StudioModelSlot } from './types.js'

/**
 * The composition root of `@jobik/ui`'s Reatom model.
 *
 * One call builds one Studio: every sub-model, named from the root `name` that is passed in
 * (RTM-S05), wired in the order `StudioModel`'s own doc comment fixes. Nothing here is a singleton
 * and nothing is module-level state, so a test builds as many as it likes and each is disposed with
 * the frame it was created in.
 *
 * **T0.1 composes nothing.** The twelve slots below are declared, typed and empty; each is filled
 * by a later, sequential wiring task, and until then reading one throws with the name of the module
 * that owes it. That is the whole point of this file's shape: a Wave 1 or Wave 2 agent adds
 * `model/<its own module>.ts` and never touches this file, so the parallel agents cannot collide
 * here.
 *
 * When the wiring task lands a slot it replaces one `pending(…)` line with the factory call —
 * `flows: reatomFlows(deps, `${name}.flows`)` — and nothing else about this function changes.
 */

/**
 * The keys that tooling probes on any object it is handed — a test runner's equality check and its
 * formatter, `console.log`, promise resolution, React's own element check. They answer `undefined`
 * so those tools keep working; every other read is a genuine model access and throws.
 *
 * Symbol keys pass through for the same reason, and as a set rather than a list because
 * `Symbol.toStringTag`, `Symbol.iterator` and `Symbol.toPrimitive` are all probed the same way.
 */
const INTROSPECTION: ReadonlySet<string> = new Set([
  '$$typeof',
  '_isMockFunction',
  'asymmetricMatch',
  'constructor',
  'hasAttribute',
  'inspect',
  'nodeType',
  'prototype',
  'tagName',
  'then',
  'toJSON',
  'toString',
  'valueOf',
])

/**
 * A sub-model slot the wiring task has not filled yet.
 *
 * It is a real, typed value, so `reatomStudio` returns a genuine `StudioModel` rather than a cast
 * and `StudioModelProvider` can carry it. Reading a model member throws and names the module that
 * owes it: that is a programmer error — someone drove a surface against a half-built model — not an
 * expected failure, so a throw is right here for the same reason it is right in `useStudioModel`.
 */
function pending<T extends object>(name: string, slot: StudioModelSlot, factory: string): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property === 'symbol' || INTROSPECTION.has(property)) return undefined
      throw new Error(
        `@jobik/ui model: \`${name}.${slot}.${property}\` was read, but \`${factory}\` is not wired into \`reatomStudio\` yet (packages/ui/src/model/studio.ts).`,
      )
    },
  })
}

export function reatomStudio(deps: StudioDeps, name = 'studio'): StudioModel {
  // The wiring order is `StudioModel`'s, and the two forwarded cycles it describes — `locked`
  // (`run.running`) and `blocked` (`validation.blocked`) — are declared here, as lazily-read
  // `computed`s, before the sub-models that consume them. They are this file's alone.
  return {
    deps,

    // --- wave 1 ---
    flows: pending(name, 'flows', 'reatomFlows'),
    draft: pending(name, 'draft', 'reatomDraft'),
    save: pending(name, 'save', 'reatomSave'),
    inputs: pending(name, 'inputs', 'reatomInputs'),
    validation: pending(name, 'validation', 'reatomValidation'),
    extension: pending(name, 'extension', 'reatomExtension'),
    run: pending(name, 'run', 'reatomRun'),

    // --- wave 2 ---
    output: pending(name, 'output', 'reatomOutput'),
    canvas: pending(name, 'canvas', 'reatomCanvas'),
    runPanel: pending(name, 'runPanel', 'reatomRunPanel'),
    flowSwitch: pending(name, 'flowSwitch', 'reatomFlowSwitch'),
    shortcuts: pending(name, 'shortcuts', 'reatomShortcuts'),
  }
}
