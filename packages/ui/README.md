# @jobik/ui

The Studio for [Jobik](../..) — a React editor for typed flows — and `@jobik/ui/server`, the local
Node server behind it.

```sh
pnpm add @jobik/ui react react-dom zod
```

ESM only. Node >= 24. React and React DOM (`^19`) and Zod v4 (`^4.5.4`) are **peer dependencies**.
`@jobik/core` and `@xyflow/react` come along as dependencies.

Two entry points, both named-import:

```ts
import { StudioApp, defineFlowUi } from '@jobik/ui'          // browser
import { defineJobikConfig } from '@jobik/ui/server'         // node
```

## `@jobik/ui` — the Studio

`@jobik/ui` is desktop-first and dark only. It is built out of layers you can use whole or in
pieces:

| Export | What it is |
| --- | --- |
| `StudioApp` | The Studio driven by a live server. Given nothing, it talks to `@jobik/ui/server` same-origin; it loads the flow list, the document and the derived control schema, validates and saves edits, starts runs and streams them, and mounts a flow's own output components. |
| `Studio` | The frame only: top bar, collapsible flows sidebar, canvas slot, run dock. Presentational — every piece of state is a prop. |
| `FlowCanvas` and the `canvas/` primitives | The React Flow canvas: node cards in all five treatments, field-level handles and typed edges (`curved` or `stepped`). |
| `RunPanel`, `RunPanelCard`, `validateRunInputs` | The run panel: typed input controls derived from the start's Zod schema, validation, timings, logs and the failure view. |
| `OutputViewer`, `OutputPreview`, `PrimaryImage`, `RawJson`, `TypedValueGrid`, `LogLines` | The output viewer and its parts. |
| `createJobikClient`, `JobikClient`, `readNdjsonStream`, the wire payload types | The browser client for `@jobik/ui/server`. Every method returns `T | Error`, never throws. |
| `StudioStyles`, `STUDIO_GLOBAL_CSS` | The global stylesheet, as a component and as a string. |
| `surfaces`, `borders`, `textColors`, `accent`, `statusColors`, `radii`, `layout`, `typeScale`, `px`, … | The design tokens, so anything you build alongside the Studio matches it. |

Mounting `FlowCanvas` outside the bundled Studio also needs React Flow's own stylesheet:

```ts
import '@xyflow/react/dist/style.css'
```

### The Studio bundle is built but nothing serves it

`@jobik/ui` builds a browser bundle of the Studio into `dist/studio` (an HTML shell, hashed assets
and CSS), and it is included in the published tarball. **No route in this package serves it, and
there is no `bin` or `dev` script that starts the app.** As of `0.1.0` you cannot open the Studio
from the installed package; what you can do is stand up the API with `@jobik/ui/server` and mount
`StudioApp` in a page of your own.

### `defineFlowUi` — a flow-local output component

A flow may ship a `flow.ui.tsx` whose default export maps a **flow-level node id** to a React
component that renders that node's successful output. Jobik keeps the node header, the input
controls, the handles, the status and the error display, and the whole output viewer chrome; your
component fills the node card's inline slot (roughly 140px tall) and the viewer's `Preview` tab.

```tsx
// flow.ui.tsx
import { defineFlowUi } from '@jobik/ui'
import { RenderedImage } from './components/RenderedImage.js'

export default defineFlowUi({
  nodes: { render: { Output: RenderedImage } },
})
```

```tsx
// components/RenderedImage.tsx
import type { OutputComponentProps } from '@jobik/ui'
import { formatBytes, isAssetDescriptor, OutputPreview } from '@jobik/ui'

export function RenderedImage(props: OutputComponentProps) {
  const image = isAssetDescriptor(props.output.image) ? props.output.image : undefined
  const src = image === undefined ? undefined : props.assetUrl(image)

  if (props.surface === 'card') {
    return src === undefined ? null : <img alt="cover.png" src={src} />
  }

  return (
    <OutputPreview
      primary={{ src, label: 'cover.png', meta: image ? [formatBytes(image.bytes)] : [] }}
      typedValues={[{ name: 'caption', value: String(props.output.caption) }]}
    />
  )
}
```

`OutputComponentProps` is deliberately **not** generic — React props are contravariant, so a
component declared against a narrower `output` could not be registered:

```ts
interface OutputComponentProps {
  readonly nodeId: string
  readonly output: Readonly<Record<string, unknown>>   // binary fields are `AssetDescriptor`s
  readonly surface: 'card' | 'viewer'
  readonly assetUrl: (descriptor: AssetDescriptor) => string | undefined
}
```

Narrow inside the component instead — `isAssetDescriptor` is exported for exactly that. `assetUrl`
returns `undefined` when the URL is not known yet; show a placeholder.

A `flow.ui.tsx` bundle may import `@jobik/ui`, `react`, `react-dom`, `react-dom/client` and
`react/jsx-runtime` — those are rewritten to the Studio's own live modules at load time.
**`@jobik/core` is not available to it:** core imports `node:fs`, so it is not browser-safe. An
extension that imports a runtime value from it falls back to the generic output view.

## `@jobik/ui/server` — the local server

A Node HTTP server that discovers the configured flows, serves their documents and descriptors,
saves edits, runs flows and streams progress, serves asset bytes, and bundles a flow's
`flow.ui.tsx` on demand.

**Jobik v1 has no authentication and no token management.** The default host is loopback for that
reason; networking and access control are the application's responsibility.

### Configuration

`jobik.config.ts` at the root of your project. Node >= 24 strips its types, so it needs no build
step.

```ts
import path from 'node:path'
import { defineJobikConfig } from '@jobik/ui/server'

const root = path.dirname(import.meta.filename)

export default defineJobikConfig({
  server: { host: '127.0.0.1', port: 4318 },
  flows: [
    {
      binding: path.resolve(root, 'flows/publication/index.ts'),
      ui: path.resolve(root, 'flows/publication/flow.ui.tsx'),
    },
  ],
})
```

```ts
type JobikConfigInput = {
  readonly server?: { readonly host?: string; readonly port?: number }
  readonly flows: readonly { readonly binding: string; readonly ui: string }[]
}
```

- `server.host` defaults to `127.0.0.1` (`JOBIK_DEFAULT_HOST`), `server.port` to `4318`
  (`JOBIK_DEFAULT_PORT`). Port `0` asks the OS for an ephemeral port.
- **`binding` and `ui` must both be absolute paths.** `binding` is the module whose default export
  is a bound flow; `ui` is carried, never imported by the config — it is handed to the bundler.
- Duplicate bindings are rejected. Validation **throws** `TypeError`: a malformed config is an
  author error discovered before the server starts, so it needs no tag from the core taxonomy.

### Discovery

Discovery is limited to exactly the configured pairs — **the server never scans a directory.** A
flow's browser-facing `id` is its own name (`jobik.flow('publication')` → `publication`), and two
flows may not share one. Every path a `DiscoveredFlow` holds is absolute and stays Node-side;
`descriptor.ts` is the only thing that turns a discovered flow into something a browser may see.

`loadJobikConfig` and `discoverFlows` **throw** for the same reason `defineJobikConfig` does: a
config or binding entrypoint that cannot be loaded must stop the server from starting. Everything a
*request* can fail on is returned as a value.

### Starting a server

```ts
import path from 'node:path'
import { jobikAllRoutes, loadJobikConfig, startJobikServer } from '@jobik/ui/server'

const config = await loadJobikConfig({
  path: path.resolve(path.dirname(import.meta.filename), 'jobik.config.ts'),
})

const server = await startJobikServer({ config, routes: jobikAllRoutes })
console.log(server.url) // e.g. http://127.0.0.1:4318
// await server.close()
```

`routes` defaults to `jobikFlowRoutes` — the four document routes only. **Pass `jobikAllRoutes`
explicitly to get the run routes.** `serveFlowRegistry({ registry, host, port, routes })` is the
lower half, for a caller that already has a `FlowRegistry` and does not want a binding module on
disk.

### HTTP operations

| Method and path | What it does |
| --- | --- |
| `GET /api/flows` | List the discovered flows. |
| `GET /api/flows/:id` | Load one flow: its browser-safe descriptor (node titles, kinds, derived input controls and output annotations), the current document, and its revision. |
| `POST /api/flows/:id/validate` | Validate a draft document against the flow. Answers **200** either way — `{ valid: true }` or `{ valid: false, error }` — because the editor validates after every edit and must not read a 4xx as a broken connection. |
| `POST /api/flows/:id/save` | Save a draft with `expectedRevision`. A stale revision is a conflict, not a clobber. |
| `POST /api/flows/:id/run` | Start a run with `{ startId, input }` and stream it. |
| `POST /api/runs/:token/cancel` | Cancel a run in flight, by the token the stream's first line carried. |
| `GET /api/assets/:assetId` | The bytes behind an `AssetDescriptor`, served with the flow author's declared MIME type, `nosniff`, and an immutable cache. |
| `GET /api/flows/:id/ui.js` | The flow's `flow.ui.tsx`, bundled on demand. |

The run transport is **newline-delimited JSON over a chunked `POST` response**, not Server-Sent
Events — a run carries an input body and `EventSource` cannot send one. One event per line, the
first always `run-accepted` (which carries the cancel token), the last always terminal. Closing the
connection aborts the run, so a closed tab does not leave a handler running.

Errors on the wire are an explicit projection per `_tag`, allowlisted against `jobikErrorTags` —
never `toJSON()`. `cause`, `stack` and absolute filesystem paths do not cross to the browser, and a
stack for a failed node is a list of trimmed `{ fn, file, line }` frames measured against the flow's
own directory. An error a handler *returned* carries no frames at all, so the failure panel's stack
block is empty for it — by design, not by omission.

## Consuming from the browser

```ts
import { createJobikClient } from '@jobik/ui'

const client = createJobikClient({ baseUrl: '' }) // same origin

const flows = await client.listFlows()
if (flows instanceof Error) return

const stream = await client.startRun({ flowId: 'publication', startId: 'start1', input })
if (stream instanceof Error) return

for await (const event of stream) {
  if (event.type === 'run-accepted') console.log(event.runToken)
}
```

Every method resolves with `T | Error` rather than rejecting. The one exception is documented on the
method itself: once `startRun` has resolved with the generator, **iterating it can throw**
`NdjsonParseError` if the server violates the protocol partway through an already-open stream. Your
`for await` must handle that.
