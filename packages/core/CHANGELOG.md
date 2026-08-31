# @jobik/core

## 0.1.0

### Minor Changes

- First release. `@jobik/core` is the engine of Jobik, a Node-first TypeScript tool for authoring,
  editing and running typed flows: a flow's node definitions live in TypeScript, while its mutable
  composition lives in one versioned JSON document. The package is namespace-imported —
  `import * as jobik from '@jobik/core'`.

  - **Typed flow authoring.** `start` and `node` define handlers against Zod v4 input and output
    schemas. `flow(name)` opens a builder that accumulates those definitions, and `bind('path', …)`
    attaches them to a flow document by absolute path. Node ids, field names and handler payloads
    are all inferred, so connecting mismatched fields is a type error before it is a runtime one.
  - **The versioned flow document.** One JSON file per flow, parsed and validated on read, carried
    forward by a migration pipeline when its version is behind, and written back through an atomic
    save that rejects a stale write with a revision conflict instead of clobbering it.
  - **Graph validation.** Before anything runs, the graph is checked for cycles, references to
    nodes that do not exist, required inputs that are neither connected nor given a literal,
    literals that collide with a connection, and field-type mismatches across a connection.
  - **Execution.** A run walks the graph from a chosen start node, emits progress events as nodes
    settle, supports cancellation, and carries binary results as assets with a declared MIME type.
  - **Errors as values.** Thirteen tagged error classes — flow file read, schema, migration,
    unsupported version, connection, start not found, run input, node execution, upstream failure,
    save, revision conflict, UI schema and cancellation — built on `errore` and returned as
    `T | Error`, never thrown. TypeScript will not let a caller forget to check one.

  ESM only; requires Node >= 24. Zod v4 is a peer dependency.

  Known limit of this release: the run event stream carries no per-node progress, so a consumer
  following a run learns how far the whole run has come, not how far any individual node has.
