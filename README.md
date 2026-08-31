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

## Status

Both packages are at `0.1.0`. Authoring, the flow document, graph validation, execution, the Studio
components and the whole HTTP surface are implemented and tested.

**There is no way to launch the Studio yet** — from this repository or from the published package.
`vite build` writes the bundle to `packages/ui/dist/studio`, but no route serves it and no `dev`
script or `bin` starts the API server. What exists is the API: `@jobik/ui/server` exports
`loadJobikConfig`, `startJobikServer` and `jobikAllRoutes`, which is enough to stand a server up
from a script of your own. Do not expect a `pnpm dev`.

The run event stream also carries no per-node progress: a consumer following a run learns how far
the whole run has come, not how far any single node has.
