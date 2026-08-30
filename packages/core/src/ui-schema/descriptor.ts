/**
 * Browser-safe editor descriptors.
 *
 * `@jobik/ui` imports this vocabulary with `import type`, so this module deliberately has NO import
 * and NO runtime export — nothing Node-only can reach the browser through it. Everything a
 * descriptor holds is JSON: no Zod schema, no handler, no absolute path, no function, and never an
 * `undefined`-valued key. `JSON.parse(JSON.stringify(descriptor))` returns the descriptor unchanged,
 * and `ui-schema/index.test.ts` proves it on a real derivation.
 */

/** Any value `JSON.parse` can produce. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** A JSON Schema subschema, kept verbatim. */
export type JsonSchemaFragment = { readonly [key: string]: JsonValue }

export type StringControlDescriptor = {
  readonly kind: 'string'
  /** JSON Schema `format`: `email`, `uri`, `date-time`, ... */
  readonly format?: string
  readonly pattern?: string
  readonly minLength?: number
  readonly maxLength?: number
}

export type NumberControlDescriptor = {
  readonly kind: 'number'
  /** `true` when the schema was `z.number().int()`, which JSON Schema types `integer`. */
  readonly integer: boolean
  readonly minimum?: number
  readonly maximum?: number
}

export type BooleanControlDescriptor = { readonly kind: 'boolean' }

export type EnumControlDescriptor = {
  readonly kind: 'enum'
  readonly options: readonly (string | number)[]
}

export type LiteralControlDescriptor = {
  readonly kind: 'literal'
  readonly value: string | number | boolean | null
}

/**
 * A binary field, declared with `asset({ mime })`. It is never an editable control: the spec makes an
 * unconnected asset input a graph validation error, not an empty form control.
 */
export type AssetControlDescriptor = { readonly kind: 'asset'; readonly mime: string }

/**
 * Everything with no native control: nested objects, arrays, unions, records, tuples, `$ref`s.
 * `schema` feeds the editor's hints ONLY. The field is validated against the node's original Zod
 * schema before a run or a save — never against this fragment.
 */
export type JsonControlDescriptor = { readonly kind: 'json'; readonly schema: JsonSchemaFragment }

export type ControlDescriptor =
  | StringControlDescriptor
  | NumberControlDescriptor
  | BooleanControlDescriptor
  | EnumControlDescriptor
  | LiteralControlDescriptor
  | AssetControlDescriptor
  | JsonControlDescriptor

/** What a binary field carries on an output row. Mirrors `AssetMeta`, kept JSON. */
export type AssetFieldMeta = { readonly mime: string }

export type InputFieldDescriptor = {
  readonly field: string
  readonly required: boolean
  /** The mono type annotation the design's field rows show: `string`, `Buffer`, `number`. */
  readonly annotation: string
  readonly title?: string
  readonly description?: string
  readonly default?: JsonValue
  readonly control: ControlDescriptor
}

export type OutputFieldDescriptor = {
  readonly field: string
  readonly required: boolean
  readonly annotation: string
  readonly title?: string
  readonly description?: string
  /** Present for a registered `asset()` field: render a thumbnail with `Open`, not a JSON well. */
  readonly asset?: AssetFieldMeta
}

export type NodeInputDescriptor = {
  readonly nodeId: string
  readonly fields: readonly InputFieldDescriptor[]
  /**
   * The root `$defs` a recursive schema produces. A `json` control's `schema` may hold
   * `{ $ref: '#/$defs/__schema0' }`, which resolves against THIS object — spread it back as `$defs`
   * to get a standalone JSON Schema document.
   */
  readonly $defs?: { readonly [name: string]: JsonSchemaFragment }
}

export type NodeOutputDescriptor = {
  readonly nodeId: string
  readonly fields: readonly OutputFieldDescriptor[]
}
