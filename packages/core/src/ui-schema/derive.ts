import * as z from 'zod'
import { JobUiSchemaError } from '../errors.js'
import type {
  ControlDescriptor,
  InputFieldDescriptor,
  JsonSchemaFragment,
  JsonValue,
  NodeInputDescriptor,
} from './descriptor.js'
import {
  assetMimeOf,
  createAssetUnrepresentableHandler,
  fieldPathOf,
  jsonPointerOf,
} from './unrepresentable.js'

/**
 * Editor metadata for one node.
 *
 * The spec derives the input form with `z.toJSONSchema(input, { io: 'input' })` and the output
 * annotations with `{ io: 'output' }`, both passing the same `unrepresentable` callback. Every
 * failure comes back as a `JobUiSchemaError` VALUE — an inaccurate form is never produced.
 */

/**
 * The parts of a converted root this module reads. Safe to assert after the JSON round-trip below:
 * a `z.ZodObject` root always emits an object subschema per property, so a boolean subschema (which
 * JSON Schema allows at `items` or `additionalProperties`) can never appear at a property position.
 */
type JsonSchemaDocument = {
  readonly properties?: { readonly [field: string]: JsonSchemaFragment }
  readonly required?: readonly string[]
  readonly $defs?: { readonly [name: string]: JsonSchemaFragment }
}

/**
 * Convert one schema, or explain why it cannot be converted.
 *
 * The `JSON.parse(JSON.stringify(...))` is not a copy for its own sake: it is what makes everything
 * downstream provably JSON, and it drops the non-enumerable `~standard` key `z.toJSONSchema` puts on
 * its result. It sits inside the `try` so any failure lands on the same error path.
 */
function convert(args: {
  nodeId: string
  schema: z.ZodObject
  io: 'input' | 'output'
}): JsonSchemaDocument | JobUiSchemaError {
  const unrepresentable = createAssetUnrepresentableHandler()
  try {
    const root = z.toJSONSchema(args.schema, {
      io: args.io,
      unrepresentable: unrepresentable.handler,
    })
    return JSON.parse(JSON.stringify(root)) as JsonSchemaDocument
  } catch (cause) {
    const site = unrepresentable.site() ?? {
      path: [],
      message: cause instanceof Error ? cause.message : String(cause),
    }
    return new JobUiSchemaError({
      nodeId: args.nodeId,
      io: args.io,
      field: fieldPathOf(site.path),
      reason: `${site.message} at ${jsonPointerOf(site.path)}`,
      cause,
    })
  }
}

/** The mono type annotation a field row shows: `string`, `Buffer`, `number`. */
function annotationOf(fragment: JsonSchemaFragment): string {
  const title = fragment.title
  if (typeof title === 'string' && title.length > 0) return title

  const type = fragment.type
  if (typeof type === 'string') return nameOfJsonType(type)
  if (Array.isArray(type)) {
    const names = type
      .filter((entry): entry is string => typeof entry === 'string')
      .map(nameOfJsonType)
    if (names.length > 0) return names.join(' | ')
  }
  return 'unknown'
}

/** The design's annotations are TypeScript-facing, so JSON Schema's `integer` reads as `number`. */
function nameOfJsonType(type: string): string {
  return type === 'integer' ? 'number' : type
}

function isEnumOption(value: JsonValue): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

function isLiteralValue(value: JsonValue): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function stringControl(fragment: JsonSchemaFragment): ControlDescriptor {
  const control: {
    kind: 'string'
    format?: string
    pattern?: string
    minLength?: number
    maxLength?: number
  } = { kind: 'string' }

  const format = fragment.format
  if (typeof format === 'string') control.format = format
  const pattern = fragment.pattern
  if (typeof pattern === 'string') control.pattern = pattern
  const minLength = fragment.minLength
  if (typeof minLength === 'number') control.minLength = minLength
  const maxLength = fragment.maxLength
  if (typeof maxLength === 'number') control.maxLength = maxLength
  return control
}

function numberControl(fragment: JsonSchemaFragment): ControlDescriptor {
  const control: { kind: 'number'; integer: boolean; minimum?: number; maximum?: number } = {
    kind: 'number',
    integer: fragment.type === 'integer',
  }

  const minimum = fragment.minimum
  if (typeof minimum === 'number') control.minimum = minimum
  const maximum = fragment.maximum
  if (typeof maximum === 'number') control.maximum = maximum
  return control
}

/**
 * Native controls first, then the generic JSON editor for everything else. Order matters: a literal
 * and an enum both also carry a `type`, so they are recognised before the plain primitives, and a
 * `type` array such as `['string','null']` is not a native control.
 */
function controlOf(fragment: JsonSchemaFragment): ControlDescriptor {
  const mime = assetMimeOf(fragment)
  if (mime !== undefined) return { kind: 'asset', mime }

  if ('const' in fragment) {
    const value = fragment.const
    if (isLiteralValue(value)) return { kind: 'literal', value }
  }

  const values = fragment.enum
  if (Array.isArray(values)) {
    const options = values.filter(isEnumOption)
    if (options.length > 0 && options.length === values.length) return { kind: 'enum', options }
  }

  switch (fragment.type) {
    case 'string':
      return stringControl(fragment)
    case 'number':
    case 'integer':
      return numberControl(fragment)
    case 'boolean':
      return { kind: 'boolean' }
    default:
      return { kind: 'json', schema: fragment }
  }
}

function inputFieldOf(
  field: string,
  fragment: JsonSchemaFragment,
  required: boolean,
): InputFieldDescriptor {
  const descriptor: {
    field: string
    required: boolean
    annotation: string
    title?: string
    description?: string
    default?: JsonValue
    control: ControlDescriptor
  } = {
    field,
    required,
    annotation: annotationOf(fragment),
    control: controlOf(fragment),
  }

  const title = fragment.title
  if (typeof title === 'string') descriptor.title = title
  const description = fragment.description
  if (typeof description === 'string') descriptor.description = description
  if ('default' in fragment) descriptor.default = fragment.default
  return descriptor
}

/**
 * One editor control per top-level field of a node's input schema. Returns `JobUiSchemaError` — as a
 * value — for any schema that cannot be represented, rather than a silently inaccurate form.
 */
export function deriveInputControls(args: {
  nodeId: string
  input: z.ZodObject
}): NodeInputDescriptor | JobUiSchemaError {
  const document = convert({ nodeId: args.nodeId, schema: args.input, io: 'input' })
  if (document instanceof JobUiSchemaError) return document

  const required = new Set(document.required ?? [])
  const fields = Object.entries(document.properties ?? {}).map(([field, fragment]) =>
    inputFieldOf(field, fragment, required.has(field)),
  )

  const descriptor: {
    nodeId: string
    fields: InputFieldDescriptor[]
    $defs?: { readonly [name: string]: JsonSchemaFragment }
  } = { nodeId: args.nodeId, fields }

  if (document.$defs !== undefined) descriptor.$defs = document.$defs
  return descriptor
}
