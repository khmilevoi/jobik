# @jobik/ui

The Studio for [Jobik](../..) — a React editor for typed flows — and `@jobik/ui/server`, the local
Node server behind it.

```sh
pnpm add @jobik/ui react react-dom zod
```

For this private checkout, use the root README's local link or tarball instructions. Build the
packages first; linked consumers resolve the same public built entrypoints and declarations as
installed packages. Do not import internal `dist` paths or enable the internal `@jobik/source`
condition in a consumer. TSX extensions also need React types in their authoring project.


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

### Opening the Studio

The package includes the built Studio and the `jobik-studio` CLI. From a consumer with its
configuration installed, run:

```sh
pnpm exec jobik-studio --config jobik.config.ts
```

The CLI serves the API and Studio together on `http://127.0.0.1:4318` by default. The config path
is relative to the current directory; `--host` and `--port` override the configured address.
For custom server routes, import `startJobikServer` and `jobikStudioServerRoutes` from
`@jobik/ui/server`, and pass your routes before the Studio routes. The built assets are located
inside the package; the consumer does not need to find or serve `dist/studio` itself.

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

## Uploading files into start inputs

The Studio can select and preview a local image before running a node. Enable the file picker for
individual `string` or `json` start fields through the server configuration:

```ts
import { defineJobikConfig } from '@jobik/ui/server'

export default defineJobikConfig({
  flows: [{
    binding: '/absolute/path/flow.ts',
    ui: '/absolute/path/flow.ui.tsx',
    inputUploads: {
      input: {
        sourceImage: {
          accept: 'image/png,image/jpeg',
          maxBytes: 16 * 1024 * 1024,
          async upload({ file, signal }) {
            // Persist with your application's storage adapter. Return errors as values.
            const result = await storeImage({ bytes: file.bytes, contentType: file.contentType, signal })
            if (result instanceof Error) return result
            return { value: result }
          },
        },
      },
    },
  }],
})
```

The node id and field must exist in the bound flow. Uploading does not execute the flow. The adapter
owns content inspection, image normalization, persistence and cleanup; Jobik does not assume a
storage service or an artifact-reference format. `file` contains `name`, `contentType` and
`bytes: Uint8Array`. Treat names and declared media types as untrusted metadata, and inspect bytes
in the adapter. `signal` is aborted when the requesting browser disconnects.

Only `accept` and `maxBytes` hints reach the browser. Defaults are PNG/JPEG and 16 MiB; configured
limits must be positive integers no larger than 64 MiB. The picker preserves manual JSON editing,
shows the selected image and upload status, and replaces the field only after a successful upload.
Failed uploads retain the prior field value. Run actions are blocked while uploads are pending.
Switching flows, starts or files discards stale upload responses and releases preview URLs.

The adapter returns `{ value }` containing only JSON data: finite primitives, arrays and plain
objects. Binary values, custom class instances, cycles and undefined members are rejected. Responses
are limited to 1 MiB, 100 nesting levels and 100,000 values. The field's real Zod schema is still
validated when the flow runs. Uploads remain in the application's storage according to its policy,
even if the user never runs the flow.

The browser uses `POST /api/flows/:id/inputs/:nodeId/:field/upload`, with JSON
`{ name, contentType, dataBase64 }`, and receives `{ value }`. The existing JSON-only mutation gate
and same-origin client remain in use. Only configured fields of declared starts accept uploads;
provider errors produce a sanitized message rather than exposing storage credentials or paths.


## Browser input drafts

Studio automatically saves edited run inputs in browser localStorage, separately for each API
base URL, flow, start node and input descriptor. Reloading the page or returning to a start restores
the draft, including incomplete JSON, empty fields and successful upload reference values. Restoring
a draft never starts a run. A changed input descriptor starts with its current defaults; normal
document reloads keep the current draft.

Only input values are saved. Selected File objects, upload bytes, temporary preview URLs, pending
requests, validation errors and run results are not stored. Uploaded files stay in the application's
storage; their saved reference can be reused after reload, while the temporary picker preview is
not restored. If browser storage is unavailable, corrupt or full, editing and running still work,
but persistence across page reloads may be unavailable. Drafts belong to the current browser origin;
clearing its site data removes them. Active drafts do not synchronize between tabs.

Headless `reatomStudio` consumers can opt in with
`inputDraftStorage: { storage: localStorage, namespace: apiBaseUrl }` in `StudioDeps`.


Image upload adapters can also provide `preview({ value, signal })`, returning
`Promise<{ bytes: Uint8Array, contentType: string } | Error>`. Studio derives a preview from the
current stored field value, including references saved before the adapter gained preview support.
The hook should validate the reference and read its stored image; it must not generate a new image.
Only a boolean capability crosses the descriptor boundary. Studio reads
`GET /api/flows/:id/inputs/:nodeId/:field/preview?value=<URL-encoded JSON>`; the server accepts at most
4096 JSON characters and serves PNG, JPEG, WebP, GIF or AVIF bytes up to 64 MiB. Errors are sanitized.
Preview failures preserve the draft. No File, image bytes or blob URL is saved in localStorage;
the native picker stays empty after reload while the stored image appears beside it.
