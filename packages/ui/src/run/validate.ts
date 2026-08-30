/**
 * The run panel's validation, from control drafts to schema-valid values.
 *
 * `zod` is imported TYPE-ONLY. `safeParse` is a method on the schema the caller passed, so nothing
 * here pulls zod into the browser bundle, and `@jobik/core` is not imported at runtime either.
 *
 * No error class is declared here. `packages/core/src/errors.ts` is frozen and its taxonomy must not
 * be duplicated in the browser, so a failure comes back as the error its own boundary produced —
 * `SyntaxError` from `JSON.parse`, `z.ZodError` from the schema. Both are `Error`, so a caller
 * narrows with `instanceof Error` and nothing is ever thrown.
 */
import type { InputFieldDescriptor } from '@jobik/core'
import type * as z from 'zod'
import type { RunInputDraft, RunInputIssue } from './types.js'

/**
 * Turn the control drafts into the value object the schema expects.
 *
 * A `literal` uses its fixed value and ignores the draft. An `asset` is omitted entirely: an
 * unconnected asset input is a graph validation error, not a form control. A field with no draft
 * entry, and an optional field left empty, are both omitted so the schema's own default or
 * `optional` applies; a REQUIRED field left empty is passed through empty, so the schema reports it
 * rather than this function guessing.
 */
export function collectRunInputValues(
  fields: readonly InputFieldDescriptor[],
  draft: RunInputDraft,
): Record<string, unknown> | SyntaxError {
  const values: Record<string, unknown> = {}

  for (const field of fields) {
    const control = field.control

    if (control.kind === 'asset') continue
    if (control.kind === 'literal') {
      values[field.field] = control.value
      continue
    }

    const raw = draft[field.field]
    if (raw === undefined) continue
    if (raw === '' && !field.required) continue

    if (control.kind === 'boolean') {
      values[field.field] = raw === true
      continue
    }

    if (control.kind === 'number') {
      values[field.field] = raw === '' ? Number.NaN : Number(raw)
      continue
    }

    // The <select> element can only hold strings. Find the original option by round-tripping:
    // String(option) === String(raw) recovers numeric and string enums alike. If no match,
    // pass raw through so the schema can reject the invalid value.
    if (control.kind === 'enum') {
      const matched = control.options.find((option) => String(option) === String(raw))
      values[field.field] = matched !== undefined ? matched : raw
      continue
    }

    if (control.kind === 'json') {
      try {
        values[field.field] = JSON.parse(String(raw))
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        return new SyntaxError(`${field.field}: ${detail}`, { cause })
      }
      continue
    }

    values[field.field] = raw
  }

  return values
}

/**
 * Collect the draft, then validate it against the start's ORIGINAL Zod schema — the check
 * `## Zod and editor controls` requires before a flow can run or save.
 */
export function validateRunInputs(args: {
  input: z.ZodObject
  fields: readonly InputFieldDescriptor[]
  draft: RunInputDraft
}): Record<string, unknown> | Error {
  const values = collectRunInputValues(args.fields, args.draft)
  if (values instanceof Error) return values

  const result = args.input.safeParse(values)
  if (!result.success) return result.error
  return result.data as Record<string, unknown>
}

/**
 * Flatten a validation failure for display or for the wire. The shape is structurally `SchemaIssue`
 * in `packages/core/src/errors.ts`, so P14 can pass it to `new RunInputError({ startId, issues })`
 * on the Node side, where that class is reachable.
 *
 * The `issues` array is read structurally rather than through `instanceof z.ZodError`, because that
 * check would need a runtime `zod` import this module deliberately does not have.
 */
export function toRunInputIssues(error: Error): readonly RunInputIssue[] {
  const issues = (error as { issues?: unknown }).issues
  if (!Array.isArray(issues)) return [{ path: '', message: error.message }]

  return issues.map((entry) => {
    const issue = entry as { path?: unknown; message?: unknown }
    return {
      path: Array.isArray(issue.path) ? issue.path.join('.') : '',
      message: typeof issue.message === 'string' ? issue.message : String(issue.message),
    }
  })
}
