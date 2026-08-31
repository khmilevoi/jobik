import type { ControlDescriptor, NodeInputDescriptor } from '@jobik/core'
import * as z from 'zod'
import type { RunInputDraft, RunInputPresentation } from '../run/index.js'

/**
 * A browser Zod schema for a start's inputs, synthesised from P6's control descriptors.
 *
 * `RunIdleState.input` needs a real `z.ZodObject` and the wire carries only JSON, so the browser
 * rebuilds one. It is a PRE-CHECK, not the authority: the server re-validates every run and its
 * `RunInputError` is what the user is finally shown. It must therefore never be STRICTER than the
 * real schema — a valid run blocked in the browser is worse than an invalid one rejected by the
 * server, which is exactly what the server is for.
 *
 * `zod` is imported at runtime here. It is already a peer and dev dependency of `@jobik/ui`; this
 * is the only module in the package that needs the constructors rather than the types.
 */

/** Beyond this, a single-line input stops being usable and the artboard's 118px area is right. */
const AREA_LENGTH_THRESHOLD = 120

function enumSchema(options: readonly (string | number)[]): z.ZodType {
  // Unreachable by construction: `packages/core/src/ui-schema/derive.ts:181` only ever produces an
  // `enum` control when `options.length > 0`, so this branch can never actually run.
  if (options.length === 0) return z.never()
  if (options.every((option) => typeof option === 'string')) {
    return z.enum(options as readonly string[] as [string, ...string[]])
  }
  const literals = options.map((option) => z.literal(option))
  if (literals.length === 1) return literals[0]
  // `z.union` needs a `[ZodType, ZodType, ...ZodType[]]` tuple, but `literals` is inferred as
  // `z.ZodLiteral<...>[]`; a direct cast is rejected as an insufficient overlap, so this goes
  // through `unknown` first, which is what tsc's own error message asks for.
  return z.union(literals as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]])
}

function controlSchema(control: ControlDescriptor): z.ZodType | undefined {
  switch (control.kind) {
    case 'string': {
      let schema = z.string()
      if (control.minLength !== undefined) schema = schema.min(control.minLength)
      if (control.maxLength !== undefined) schema = schema.max(control.maxLength)
      if (control.pattern !== undefined) schema = schema.regex(new RegExp(control.pattern))
      return schema
    }
    case 'number': {
      let schema = control.integer ? z.number().int() : z.number()
      if (control.minimum !== undefined) schema = schema.gte(control.minimum)
      if (control.maximum !== undefined) schema = schema.lte(control.maximum)
      return schema
    }
    case 'boolean':
      return z.boolean()
    case 'enum':
      return enumSchema(control.options)
    case 'literal':
      return z.literal(control.value)
    case 'json':
      // The descriptor carries a JSON Schema fragment, not a Zod schema. Rebuilding one here would
      // be a second, divergent validator; the server owns this check.
      return z.unknown()
    case 'asset':
      // `collectRunInputValues` omits asset fields entirely, so the object must not declare one.
      return undefined
  }
}

export function toRunInputSchema(descriptor: NodeInputDescriptor): z.ZodObject {
  const shape: Record<string, z.ZodType> = {}

  for (const field of descriptor.fields) {
    const schema = controlSchema(field.control)
    if (schema === undefined) continue
    shape[field.field] = field.required ? schema : schema.optional()
  }

  return z.object(shape)
}

/**
 * The draft a freshly loaded idle panel starts from.
 *
 * Ruling R4: every `enum` control — required and optional alike — is seeded with `options[0]`.
 * `RunInputControl.tsx`'s `<select>` renders one `<option>` per declared option and no empty
 * option, so a draft holding `''` still *displays* as the first option selected. Seeding the draft
 * with `''` for a required enum with no default therefore desyncs the control from the draft in
 * exactly the way `initialRunInputDraft` exists to prevent for booleans — and worse, it makes
 * `collectRunInputValues` pass `''` through (required defeats the empty-skip), which the
 * synthesised enum schema then rejects even though the visible control shows a valid selection.
 *
 * Seeding is run-state setup rather than a control concern, which is why it lives here.
 */
export function initialRunInputDraft(descriptor: NodeInputDescriptor): RunInputDraft {
  const draft: Record<string, string | boolean> = {}

  for (const field of descriptor.fields) {
    const control = field.control

    if (control.kind === 'asset') continue

    if (control.kind === 'literal') {
      draft[field.field] = String(control.value)
      continue
    }

    if (control.kind === 'boolean') {
      draft[field.field] = typeof field.default === 'boolean' ? field.default : false
      continue
    }

    if (control.kind === 'enum') {
      draft[field.field] =
        field.default !== undefined ? String(field.default) : String(control.options[0])
      continue
    }

    if (field.default === undefined) {
      draft[field.field] = ''
      continue
    }

    draft[field.field] =
      control.kind === 'json' ? JSON.stringify(field.default, null, 2) : String(field.default)
  }

  return draft
}

/**
 * `### Run panel` idle: `title` is a single line and `markdown` a 118px monospace area.
 *
 * `InputFieldDescriptor` carries no signal that separates them — both are a bare `z.string()` in the
 * example flow — so the rule is the draft's own shape: a value that already spans lines, or is long
 * enough that a single-line input cannot show it, gets the area. A `json` control is always an area,
 * which P11's `RunInputControl` enforces regardless of what is passed here.
 *
 * Reproducing the artboard on FIRST render would need a signal the descriptor does not carry. That
 * is recorded as a spec gap for closeout, not worked around with a field-name heuristic here.
 */
export function runInputPresentation(
  descriptor: NodeInputDescriptor,
  draft: RunInputDraft,
): Readonly<Record<string, RunInputPresentation>> {
  const presentation: Record<string, RunInputPresentation> = {}

  for (const field of descriptor.fields) {
    if (field.control.kind === 'json') {
      presentation[field.field] = 'area'
      continue
    }
    if (field.control.kind !== 'string') {
      presentation[field.field] = 'line'
      continue
    }

    const value = draft[field.field]
    const text = typeof value === 'string' ? value : ''
    presentation[field.field] =
      text.includes('\n') || text.length > AREA_LENGTH_THRESHOLD ? 'area' : 'line'
  }

  return presentation
}
