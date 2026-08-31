# @jobik/core

The engine of [Jobik](../..), a Node-first TypeScript tool for authoring, editing and running typed
flows. This package defines flows, validates and migrates the JSON document that holds their
composition, checks the graph, and executes it.

```sh
pnpm add @jobik/core zod
```

ESM only. Node >= 24. Zod v4 (`^4.5.4`) is a **peer dependency** — you install it.

`@jobik/core` is namespace-imported. It has no default export and no `jobik` object export; the
prefix below is just the alias:

```ts
import * as jobik from '@jobik/core'
```

## Errors are values, not exceptions

Read this before anything else — it is the one thing about this API that surprises people.

Jobik uses [`errore`](https://errore.org): **an expected failure is returned, not thrown.** A
function that can fail returns `T | Error`, and you narrow it with `instanceof`. There is no
`try`/`catch` around a Jobik call, and TypeScript will not let you use the value until you have
checked it.

```ts
const result = await publication.run('start1', { title: 'Typed flows', markdown: '## Release' })

if (result instanceof Error) {
  // `result` is a `RunStartError` here — the run never began.
  if (result instanceof jobik.RunInputError) {
    for (const issue of result.issues) console.error(`${issue.path}: ${issue.message}`)
  }
  return
}

// `result` is a `RunReport`.
console.log(result.status, result.runNumber, result.nodes.length)
```

The same convention runs all the way down: a node's handler **returns** an `Error` to fail:

```ts
run: (input) => {
  const unsupported = unsupportedColourProfile(input.markdown)
  if (unsupported !== undefined) return new ImageRenderError(unsupported)
  return { image: raster(`${input.title}\n${input.markdown}`), caption: captionFor(input) }
}
```

Two things are deliberately *not* returned, because they are author errors discovered at module
scope and never crossable to a browser: a duplicate node id and a relative binding path both throw
`TypeError` from the builder.

## Authoring

### `jobik.start({ title, input })`

A start: an input schema and no handler. When a run selects it, its **validated input becomes its
output fields** — which is why a start card shows its input field names under `OUTPUTS`. A flow may
declare any number of starts.

```ts
import * as jobik from '@jobik/core'
import * as z from 'zod'

export const publicationInput = jobik.start({
  title: 'Publication input',
  input: z.object({ title: z.string(), markdown: z.string() }),
})
```

### `jobik.node({ title, input, output, run, kind? })`

An ordinary node. `kind` defaults to `'transform'`; pass `'sink'` for a terminal node. `kind` is
editor grouping only — it affects neither binding, nor validation, nor execution.

```ts
export const imageOut = jobik.node({
  title: 'Render image',
  kind: 'transform',
  input: z.object({ title: z.string(), markdown: z.string() }),
  output: z.object({
    image: jobik.asset({ mime: 'image/png' }),
    caption: z.string(),
  }),
  run: (input, context) => {
    context.log('rasterising')
    return { image: raster(`${input.title}\n${input.markdown}`), caption: captionFor(input) }
  },
})
```

The handler receives the **validated** input (`z.output` of the input schema) and a
`NodeRunContext`:

```ts
type NodeRunContext = {
  readonly signal: AbortSignal
  readonly log: (message: string) => void
}
```

`signal` aborts when the run is cancelled. A line written through `log` reaches both the progress
stream and the run report.

### A definition carries no id

`start()` and `node()` return reusable code values with **no runtime id**. The flow builder assigns
the only id a node ever has, when it attaches the definition. The same definition can be attached
twice, under two ids, in two flows.

### `jobik.flow(name)` — the builder chain

```ts
import path from 'node:path'
import * as jobik from '@jobik/core'

export function buildPublicationFlow() {
  return jobik
    .flow('publication')
    .start('start1', publicationInput)
    .node('render', imageOut)
    .node('publish', httpSink)
}

const documentPath = path.resolve(path.dirname(import.meta.filename), 'flow.jobik.json')

export const publication = buildPublicationFlow().bind('path', documentPath)
export default publication
```

`.start()` and `.node()` each return a **new** builder carrying one more entry in its type
parameter, so `startId`, `input` and every node output stay inferred down the chain. Re-using an id
is a compile error before it is a runtime one (`FreshNodeId` resolves to the literal string
`` `duplicate node id: render` ``).

`.bind('path', value)` closes the chain and returns a `BoundFlow`. **The path must be absolute** —
a relative one throws `TypeError`. That is why bindings are written with `path.resolve` against
`import.meta.filename`.

A `BoundFlow` exposes `name`, `path`, `nodes` and `run()`.

### `jobik.asset({ mime })` — binary fields

```ts
output: z.object({ image: jobik.asset({ mime: 'image/png' }) })
```

`asset()` returns a Zod schema that accepts any `Uint8Array` and registers the declared MIME type.
**In process, the field holds a real `Buffer`** — that is what `run()` gives back to application
code. Replacing it with an `AssetDescriptor` is a serialisation step the server performs as a report
crosses to the browser; nothing in this package does it.

```ts
type AssetDescriptor = {
  readonly type: 'Buffer'
  readonly mime: string
  readonly bytes: number
  readonly id: string
}
```

`registerAsset({ data, mime })` mints a descriptor and stores the bytes in an in-process store;
`readAsset(id)` reads them back. `assetMetaOf(schema)` reports whether a schema is an asset field
(use it rather than `assetRegistry.has()`, which does not walk Zod's parent chain through
`.describe()` or `.refine()`).

## Running

```ts
run(startId, input, options?): Promise<RunReport | RunStartError>
```

`run()` loads the current document from disk, binds it to the flow, validates the graph, narrows it
to the subgraph the chosen start reaches, validates the run input, and executes. Everything that
stops a run *before it starts* comes back as a `RunStartError`; everything that happens *once it
started* lives in the report.

```ts
type RunStartError =
  | ConnectionError            // the graph is invalid
  | FlowFileReadError          // the document could not be read
  | FlowMigrationError         // migrating an older document failed
  | FlowSchemaError            // the document is not a valid jobik.flow document
  | RunInputError              // the input does not match the start's schema
  | StartNotFoundError         // no such start
  | UnsupportedFlowVersionError
```

Only nodes downstream of the selected start run. Run numbers are monotonic per flow, keyed by the
document path, and **process-local**: the first run of a flow in a process is `#1`, and nothing is
persisted across a restart.

### The report

```ts
type RunReport = {
  readonly flowName: string
  readonly startId: string
  readonly runNumber: number
  readonly status: 'ok' | 'failed' | 'cancelled'
  readonly elapsedMs: number
  readonly nodes: readonly NodeReport[]   // one per reachable node, in run order
  readonly logs: readonly RunLogLine[]    // interleaved across nodes, in emission order
  readonly error: RunCancelledError | null
}

type NodeReport = {
  readonly nodeId: string
  readonly status: NodeStatus
  readonly elapsedMs: number
  readonly output: Readonly<Record<string, unknown>> | null   // null unless `ok`
  readonly assets: Readonly<Record<string, AssetDescriptor>>
  readonly error: Error | null                                 // null when `ok`
}
```

`NodeStatus` is a closed set — `nodeStatuses` exports it as a const tuple:

| status | meaning |
| --- | --- |
| `queued` | reachable, not started |
| `running` | handler in flight |
| `ok` | settled, `output` populated |
| `failed` | the handler returned or threw an error (`NodeExecutionError`) |
| `skipped` | an upstream node failed (`UpstreamFailedError`) |
| `cached` | reserved. **Nothing in v1 ever produces it**; there is no caching. |

`RunStatus` (`ok` / `failed` / `cancelled`) describes the run as a whole and is deliberately not a
member of the node vocabulary.

### Progress events and cancellation

```ts
const controller = new AbortController()

const report = await publication.run(
  'start1',
  { title: 'Typed flows', markdown: '## Release' },
  {
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === 'node-status') console.log(event.nodeId, event.status)
    },
  },
)
```

`onEvent` is called synchronously as the run progresses. A run emits, in order: one `run-started`,
one `node-status` per node entering `queued`, then per-node transitions and `node-log` lines as it
goes, and finally `run-settled` carrying **the very same report object** the awaited call returns.

```ts
type RunEvent =
  | { type: 'run-started'; runNumber: number; flowName: string; startId: string; nodeCount: number }
  | { type: 'node-status'; nodeId: string; status: NodeStatus; elapsedMs: number; error: Error | null }
  | { type: 'node-log'; line: RunLogLine }
  | { type: 'run-settled'; report: RunReport }
```

A throw from `onEvent` is contained: the run still settles and produces its report, and only that
one event is lost for that consumer.

Aborting `signal` settles the run with `RunCancelledError` (`report.status === 'cancelled'`,
`report.error` set) and **keeps every result that had already settled**. A handler observes the same
abort through `context.signal`.

Note that the event stream carries no per-node progress in `0.1.0`. A consumer learns how far the
run has come, not how far any single node has.

## The flow document

One JSON file per flow. It holds `connections`, `literals` and `layout` under a `format` /`version`
envelope, and nothing else — the current-version schema is strict, so a stray node definition or
handler in the file is a validation failure rather than data silently dropped on the next save.

```ts
const file = await jobik.readFlowDocument({ path: documentPath })
if (file instanceof Error) return file
// file.document, file.revision
```

- `readFlowDocument({ path, migrations? })` → `FlowDocumentFile | FlowFileReadError |
  FlowSchemaError | FlowMigrationError | UnsupportedFlowVersionError`. Reading and JSON parsing are
  the two error boundaries; a BOM on a hand-edited file is tolerated.
- `parseFlowDocument`, `migrateFlowDocument`, `flowMigrations` — the version pipeline.
  `CURRENT_FLOW_VERSION` is `1` and `flowMigrations` is empty; `version` covers the whole file.
- `serializeFlowDocument(document)` produces the canonical text: fixed key order, two-space indent,
  trailing newline, and key order inside `literals` and `layout` preserved, so a save rewrites only
  what changed.
- `revisionOf(contents)` hashes the raw bytes. Pair it with `writeFileAtomic({ path, contents })`
  (temporary file, `fsync`, rename) to save without clobbering a concurrent edit — a stale write is
  reported as `FlowRevisionConflictError`.
- `flowDocumentSchema`, `flowConnectionSchema`, `flowNodePositionSchema`, `flowEnvelopeSchema` and
  the matching types are exported for anyone building on the format.

## Graph validation and editor schema

- `validateFlowGraph({ flow, document })` → `ValidatedFlowGraph | ConnectionError`. Binds an
  untrusted document to a flow: unknown nodes and fields, incompatible field types across a
  connection, an input field with two incoming connections, a connection or literal aimed at a
  start, cycles, literals colliding with a connection, and required inputs that are neither
  connected nor given a literal. The first problem is returned — the taxonomy carries one
  `ConnectionError`, not a list. `layout` is editor state and is deliberately not validated.
- `resolveRunGraph({ graph, startId })` → `RunGraph | StartNotFoundError`. Narrows a validated graph
  to the subgraph one start reaches.
- `deriveInputControls({ nodeId, input })` → `NodeInputDescriptor | JobUiSchemaError` turns a Zod
  input schema into one browser-safe control descriptor per top-level field (`string`, `number`,
  `boolean`, `enum`, `literal`, `asset`, `json`). `deriveOutputFields({ nodeId, output })` →
  `NodeOutputDescriptor | JobUiSchemaError` does the same for output annotations. A schema that
  cannot be represented is reported as a value, not rendered as a silently inaccurate form.

## The error taxonomy

Thirteen tagged classes, built with `errore.createTaggedError`. Each carries a `_tag`, an
interpolated message, typed fields and a `cause`. `jobikErrorTags` exports every tag as a const
tuple, and `JobikError` is the union.

| Class | Fields beyond the message | When |
| --- | --- | --- |
| `FlowFileReadError` | — | The document could not be read from disk. |
| `FlowSchemaError` | `issues: SchemaIssue[]` | The file is not valid JSON, or not a valid `jobik.flow` document. |
| `FlowMigrationError` | `from`, `to` | Migrating an older document to the current version failed. |
| `UnsupportedFlowVersionError` | `version`, `supported` | The document declares a version this build cannot read. |
| `ConnectionError` | `from`, `to`, `cycle` | The graph is invalid: unknown node or field, incompatible field types, a doubly-connected input, a connection or literal aimed at a start, a missing required input, a literal/connection collision, or a cycle. |
| `StartNotFoundError` | `available: string[]` | The flow declares no start with that id. |
| `RunInputError` | `issues: SchemaIssue[]` | The run input does not match the start's schema. |
| `NodeExecutionError` | `runNumber`, `frames: StackFrame[]`, `hiddenFrames` | A handler returned or threw an error. |
| `UpstreamFailedError` | `runNumber` | A node was skipped because an upstream node failed. |
| `FlowSaveError` | — | Writing the document failed. |
| `FlowRevisionConflictError` | — | The document changed on disk since it was loaded. |
| `JobUiSchemaError` | `io: 'input' \| 'output'` | No editor control can be derived for a field. |
| `RunCancelledError` | `runNumber` | The run was aborted. Extends `errore.AbortError`. |

Two supporting shapes: `SchemaIssue` is `{ path, message }`, and `StackFrame` is
`{ fn, file, line }` — a trimmed frame for a failure panel, never a raw `Error.stack`.

**Do not put `toJSON()` output on the wire.** The `toJSON()` these classes inherit emits `cause` and
`stack`, which must never reach a browser, and omits the declared fields above, which are exactly
what a browser needs. Any message interpolating `$path` embeds an absolute filesystem path, because
bindings are always absolute. A wire layer must build an explicit projection per `_tag`, allowlisted
against `jobikErrorTags` — which is what `@jobik/ui/server` does.
