# @jobik/ui

## 0.1.0

### Minor Changes

- First release. `@jobik/ui` is the Studio for Jobik — a React editor for composing typed flows,
  plus `@jobik/ui/server`, the Node server that backs it. It builds on `@jobik/core`, which owns
  the flow definitions, the flow document and execution. Both entry points use named imports.

  - **The editor.** A React Flow canvas for composing the graph and editing node inputs, a run
    panel that follows a run and reports its outcome, and an output viewer that renders a node's
    result. `import { Studio } from '@jobik/ui'`. Desktop-first and dark only.
  - **Flow-local output UI.** A flow that ships a `flow.ui.tsx` gets its own component rendered in
    the output viewer instead of the generic one; `defineFlowUi` types it, and the server bundles
    it at runtime.
  - **`@jobik/ui/server`.** Discovers flows from a `jobik.config.ts` written with
    `defineJobikConfig`, serves and persists the flow document, executes flows and streams the run
    over NDJSON, and bundles those flow-local UI extensions.

  ESM only; requires Node >= 24. React 19 is a peer dependency.

  Known limits of this release. The Studio browser bundle is published inside the package, but the
  package exposes no route that serves it, so mounting the editor means wiring a static route
  yourself. The run event stream carries no per-node progress, so a node shown as running reports
  how far the whole run has come rather than its own share.
