import * as z from 'zod'
import { assetMetaOf } from '../asset.js'

/**
 * How this plan classifies one field schema, for the single purpose of deciding whether a
 * connection between two fields can ever carry a value.
 *
 * `'unknown'` means "this plan cannot decide" — a union, a record, a non-asset `z.custom()`, a
 * transform. It is compatible with every kind, deliberately: the policy is to reject only what can
 * never work, never to guess. This classifier is NOT the editor's control derivation, which is P6's
 * and goes through `z.toJSONSchema`; it is intentionally coarser and is not exported from the
 * package barrel.
 */
export type FieldTypeKind =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'object'
  | 'array'
  | 'asset'
  | 'unknown'

/**
 * Which side of a connection a field sits on. An output's kind is what it produces; an input's
 * kind is what it accepts. They differ whenever a schema transforms or coerces.
 */
export type FieldIo = 'input' | 'output'

/** Wrappers that change a field's cardinality, not the kind of value it carries. */
const CARDINALITY_WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'catch',
  'readonly',
  'nonoptional',
])

/** How deep a wrapper chain is followed. Deeper than any real schema; a guard, not a limit. */
const MAX_UNWRAP_DEPTH = 32

type LooseDef = {
  type: string
  innerType?: z.core.$ZodType
  in?: z.core.$ZodType
  out?: z.core.$ZodType
  entries?: Record<string, unknown>
  values?: readonly unknown[]
  coerce?: boolean
}

function defOf(schema: z.core.$ZodType): LooseDef {
  return schema._zod.def as LooseDef
}

/** Peel cardinality wrappers and pipes down to the schema that decides the kind. */
function unwrap(schema: z.core.$ZodType, io: FieldIo): z.core.$ZodType {
  let current = schema
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    const def = defOf(current)
    if (CARDINALITY_WRAPPERS.has(def.type) && def.innerType !== undefined) {
      current = def.innerType
      continue
    }
    if (def.type === 'pipe') {
      const next = io === 'input' ? def.in : def.out
      if (next !== undefined) {
        current = next
        continue
      }
    }
    return current
  }
  return current
}

function kindOfValue(value: unknown): FieldTypeKind {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'bigint') return 'bigint'
  if (typeof value === 'boolean') return 'boolean'
  return 'unknown'
}

/** An enum or literal is as narrow as its members, and only when they all agree. */
function kindOfValues(values: readonly unknown[]): FieldTypeKind {
  const kinds = new Set(values.map(kindOfValue))
  const [only] = [...kinds]
  return kinds.size === 1 && only !== undefined ? only : 'unknown'
}

/**
 * Classify one field schema. Never throws.
 *
 * `io` says which end of a connection the field sits on, and it matters: a pipe's input kind is
 * `def.in` while its output kind is `def.out`, and a coercing primitive accepts far more than its
 * own kind — `z.coerce.number()` parses the string '42'. On the input side this plan therefore
 * cannot decide, and the policy is to reject only what can never work.
 */
export function fieldTypeOf(schema: z.core.$ZodType, io: FieldIo = 'output'): FieldTypeKind {
  if (assetMetaOf(schema) !== undefined) return 'asset'
  const inner = unwrap(schema, io)
  if (assetMetaOf(inner) !== undefined) return 'asset'
  const def = defOf(inner)
  if (io === 'input' && def.coerce === true) return 'unknown'
  switch (def.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'bigint':
      return 'bigint'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'date'
    case 'object':
      return 'object'
    case 'array':
    case 'tuple':
      return 'array'
    case 'enum':
      return kindOfValues(Object.values(def.entries ?? {}))
    case 'literal':
      return kindOfValues(def.values ?? [])
    default:
      return 'unknown'
  }
}

/** Reject only what can never work: two kinds that are both known and different. */
export function areFieldTypesCompatible(from: FieldTypeKind, to: FieldTypeKind): boolean {
  return from === 'unknown' || to === 'unknown' || from === to
}

/**
 * A field is required exactly when its schema rejects `undefined`. That is the semantic question,
 * asked of Zod rather than guessed from `_zod.def.type`, so `.optional()`, `.default()`,
 * `.prefault()`, `z.any()` and `z.unknown()` all answer correctly without being enumerated.
 */
export function isRequiredField(schema: z.core.$ZodType): boolean {
  try {
    return !z.safeParse(schema, undefined).success
  } catch {
    // `z.safeParse` throws on a schema whose refinement is async, and this clause deliberately
    // catches every synchronous failure rather than only that one: this function must stay total,
    // because the whole module contracts never to throw. Following the plan's policy — reject only
    // what can never work — an undecidable field is treated as not required.
    return false
  }
}
