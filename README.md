# Jobik

Jobik is a Node-first TypeScript tool for authoring, editing and running typed flows.

A flow's **node definitions live in TypeScript**: a title, a Zod input schema, a Zod output schema
and a handler. A flow's **mutable composition lives in one versioned JSON file** — `flow.jobik.json`
— which holds only what an editor may change: field-to-field connections, literal inputs and canvas
layout. It never duplicates a definition, a schema, a handler or a start declaration. The Studio, a
React editor, edits that file; nothing else in the flow moves.

```ts
// nodes/imageOut.ts — the definition. Reusable, and it carries no id.
import * as jobik from '@jobik/core'
import * as z from 'zod'

export const imageOut = jobik.node({
  title: 'Render image',
  input: z.object({ title: z.string(), markdown: z.string() }),
  output: z.object({ image: jobik.asset({ mime: 'image/png' }), caption: z.string() }),
  run: (input) => ({
    image: raster(`${input.title}\n${input.markdown}`),
    caption: captionFor(input),
  }),
})
```

```ts
// index.ts — the binding. The builder assigns the only id each definition ever has.
import path from 'node:path'
import * as jobik from '@jobik/core'

export default jobik
  .flow('publication')
  .start('start1', publicationInput)
  .node('render', imageOut)
  .node('publish', httpSink)
  .bind('path', path.resolve(path.dirname(import.meta.filename), 'flow.jobik.json'))
```

```jsonc
// flow.jobik.json — the composition. This is the only file the editor writes.
{
  "format": "jobik.flow",
  "version": 1,
  "connections": [
    { "from": { "node": "start1", "field": "title" }, "to": { "node": "render", "field": "title" } }
  ],
  "literals": {},
  "layout": { "start1": { "x": 56, "y": 248 } }
}
```

## Packages

| Package | What it is |
| --- | --- |
| [`@jobik/core`](packages/core) | The engine. Zod-based flow definitions, the versioned JSON document with validation and migration, graph validation, execution with progress events and cancellation, and the tagged error taxonomy. Namespace-imported. |
| [`@jobik/ui`](packages/ui) | The Studio: a React Flow editor, the run panel, the output viewer and a browser client — plus `@jobik/ui/server`, the local Node server that discovers flows, loads and saves documents, runs them and bundles flow-local UI. |

## Requirements

- **Node >= 24.** `import.meta.filename` is the floor, and the config loader relies on Node's
  built-in TypeScript type stripping to import a `jobik.config.ts` with no build step.
- **ESM only.** Neither package ships CommonJS.
- **Zod v4** (`^4.5.4`) is a peer dependency of both packages; `@jobik/ui` additionally peers on
  React and React DOM `^19`.

## Repository layout

```text
packages/core/         @jobik/core
packages/ui/           @jobik/ui and @jobik/ui/server
examples/showcase/     @jobik/examples — the showcase flows and their Studio configuration
                       (`publication` is the flow the Studio design was drawn from)
```

pnpm workspaces over `packages/*` and `examples/*`, orchestrated by Turborepo. tsdown builds both
packages (ESM, `dts: true`); Vite builds the Studio browser bundle and is also the runtime bundler
for a flow's `flow.ui.tsx`. vitest runs the tests, biome lints and formats, Changesets owns
versions — `@jobik/core` and `@jobik/ui` are linked and move as one.

Inside the workspace each package's `exports` map points at `src`, so `typecheck` and the tests read
TypeScript sources directly and never wait on a build.

## Working in this repository

```sh
pnpm install
pnpm turbo run lint typecheck test build   # the gate; also `pnpm check`
```

Tests live beside their subject as `*.test.ts(x)`. There is no separate test tree.

## Local development and installation

Both packages are private. Build them in this checkout before consuming them locally:

```sh
pnpm build
```

For a linked development setup, run this from the consuming workspace root (adjust paths):

```sh
pnpm link ../jobik/packages/core ../jobik/packages/ui
```

With pnpm 10 this updates workspace-wide overrides, the root manifest and the lockfile; it is a
local development configuration that requires this checkout. It is not a production dependency
substitute. The consuming packages should declare the Jobik dependencies they use, and linking
does not install the producer's own dependencies. Run `pnpm install` in this checkout first.

Use public imports: `@jobik/core`, `@jobik/ui` and `@jobik/ui/server`. Ordinary resolution,
including `pnpm link`, selects built JavaScript and its adjacent declarations. Consumers do not
need `dist` imports, TypeScript `paths` mappings or a Node resolution hook. Rebuild Jobik after
source changes so the linked consumer sees them. The `jobik-studio` CLI serves the built Studio.

Jobik's own TypeScript, Vite, Vitest and development runner opt into the `@jobik/source` export
condition to work directly on source. Consumers should leave that condition disabled. The
development runner also resolves the source tree's `.js` import specifiers to TypeScript files;
plain Node does not perform that rewrite.

`react`, `react-dom` and `zod` remain peers. A flow-local TSX renderer needs React authoring
types in its TypeScript project; the standalone Studio provides the browser React runtime.

For a self-contained install, `pnpm pack:local` builds tarballs into `.local-packages/`
(gitignored). Point the consumer at both tarballs, and redirect the UI's core dependency to the
same tarball because the private version is unavailable from a registry:

```json
{
  "dependencies": {
    "@jobik/core": "file:/abs/path/to/jobik/.local-packages/jobik-core-0.1.0.tgz",
    "@jobik/ui": "file:/abs/path/to/jobik/.local-packages/jobik-ui-0.1.0.tgz"
  },
  "pnpm": {
    "overrides": {
      "@jobik/core": "file:/abs/path/to/jobik/.local-packages/jobik-core-0.1.0.tgz"
    }
  }
}
```

Repack after a source change and refresh the consumer's install to pick up the new tarballs.

## Status

Both packages are at `0.1.0`. Authoring, the flow document, graph validation, execution, the Studio
components and the whole HTTP surface are implemented and tested.

The Studio launches. `jobikStudioAssetRoutes` serves the prebuilt browser bundle from
`packages/ui/dist/studio` beside the API on one origin, and `@jobik/ui`'s `bin` — `jobik-studio` —
is the entry point a consumer runs. In this repository the same server runs straight from the
TypeScript sources:

```sh
pnpm --filter @jobik/examples run build:client   # the browser bundle, once
pnpm --filter @jobik/examples run dev:server     # bundle + API on http://127.0.0.1:4318
```

`dev:client` beside it (`pnpm --filter @jobik/examples run dev:client`) gives the browser bundle
hot reload while `dev:server` keeps serving the API. The configuration both read is
`examples/showcase/jobik.config.ts`.

The run event stream also carries no per-node progress: a consumer following a run learns how far
the whole run has come, not how far any single node has.
