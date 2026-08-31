---
'@jobik/core': minor
'@jobik/ui': minor
---

First release of Jobik — a Node-first TypeScript tool for authoring, editing and running typed
flows. A flow's node definitions live in TypeScript; its mutable composition lives in one versioned
JSON document. The two packages split along that line.

**`@jobik/core`** — namespace-imported as `import * as jobik from '@jobik/core'`.

- **Typed flow authoring.** `start` and `node` define handlers against Zod v4 input and output
  schemas. `flow(name)` opens a builder that accumulates those definitions and `bind('path', …)`
  attaches them to a flow document by absolute path. Node ids, field names and handler payloads are
  all inferred, so connecting mismatched fields is a type error before it is a runtime one.
- **The versioned flow document.** One JSON file per flow, parsed and validated on read, carried
  forward by a migration pipeline when its version is behind, and written back through an atomic
  save that rejects a stale write with a revision conflict instead of clobbering it.
- **Graph validation and execution.** Before anything runs, the graph is checked for cycles,
  references to nodes that do not exist, required inputs that are neither connected nor given a
  literal, literals that collide with a connection, and field-type mismatches across a connection.
  Execution then walks the graph from a chosen start node, emits progress events as nodes settle,
  supports cancellation, and carries binary results as assets with a declared MIME type.
- **Errors as values.** Thirteen tagged error classes — flow file read, schema, migration,
  unsupported version, connection, start not found, run input, node execution, upstream failure,
  save, revision conflict, UI schema and cancellation — built on `errore` and returned as
  `T | Error`, never thrown. TypeScript will not let a caller forget to check one.

**`@jobik/ui`** — the Studio editor, plus `@jobik/ui/server`.

- A React Flow canvas for composing the graph, a run panel that follows a run and reports its
  outcome, and an output viewer that renders a node's result — including a flow-local `flow.ui.tsx`
  component, bundled at runtime, when a flow ships one.
- `@jobik/ui/server` is the Node side: it discovers flows from a `jobik.config.ts`, serves and
  persists the flow document, executes flows and streams the run over NDJSON, and bundles those
  flow-local UI extensions.

Both packages are ESM only and require Node >= 24. Zod v4 is a peer dependency of `@jobik/core`.

Known limits of this release. The Studio browser bundle is published inside `@jobik/ui`, but the
package exposes no route that serves it, so mounting the editor means wiring a static route
yourself. The run event stream carries no per-node progress, so a node shown as running reports how
far the whole run has come rather than its own share.
