# Jobik

Node-first TypeScript tool for authoring, editing, and running typed flows. Node definitions live in
TypeScript; mutable graph composition lives in one versioned JSON file per flow. Two packages:
`@jobik/core` (Zod flow definitions, document validation/migration, errore-based errors, execution)
and `@jobik/ui` (React Studio editor plus `@jobik/ui/server`).

v1 is implemented and both packages are at `0.1.0`. `@jobik/core` covers authoring, the
`flow.jobik.json` document, graph validation, the Zod-to-control UI schema and the execution engine.
`@jobik/ui` covers the Studio — shell, React Flow canvas, run panel, output viewer, streaming client
— and `@jobik/ui/server` serves the whole API. `examples/publication` is the flow every artboard in
the design shows, and `jobik.config.ts` at the root points the Studio at it. What is *not* finished
is listed in `.superpowers/waves/2026-08-29-jobik-v1/closeout/DEFERRED.md` (local-only; see *Docs*);
read it before believing any feature works end to end. That list is much shorter than it was: most
of it was worked through on 2026-08-31, and each entry now says so. What remains is either an
operator decision or a feature, not an oversight.

## Layout

```
packages/core/src/
  index.ts        append-only barrel; the whole namespace surface
  errors.ts       FROZEN error taxonomy — every JobikError class
  flow.ts node.ts asset.ts   authoring: `flow()`, `node()`, `start`, asset descriptors
  document/       flow.jobik.json schema, parse, migrate, read, atomic write, revision hashes
  graph/          topology, field types, graph validation, the run graph
  run/            execution: execute, run, run numbers, asset handling, run types
  ui-schema/      Zod schema -> control descriptors for the run panel

packages/ui/src/
  index.ts        append-only browser barrel (named imports)
  tokens.ts globalStyles.tsx   design tokens and the global stylesheet
  primitives/     Badge, Button, Chip, InsetWell, SectionLabel, TypeAnnotation
  shell/          StudioFrame, TopBar, FlowsSidebar, RunDock, PanelHeader, DockedControls
  canvas/         React Flow canvas: FlowCanvas, NodeCard*, FieldEdge/FieldHandle, edge paths
  run/            run panel views, typed input controls, input validation
  output/         output viewer, `defineFlowUi`, value formatting
  client/         JobikClient, NDJSON stream decoding, wire types
  studio/         StudioApp/Studio, session hooks, run presenter, extension loader,
                  plus `main.tsx` + `index.html` — the Vite entry for the bundled Studio
  server/         `@jobik/ui/server`: config, discovery, flowService, httpServer, routes,
                  runRoutes, runRegistry, extensionBundle, wire projection and safety

examples/publication/
  index.ts        the binding: `start1` -> `render` -> `publish`, bound to an absolute path
  nodes/          publicationInput, imageOut, httpSink, markdown, and the sidebar inventory
  flow.jobik.json the versioned document
  flow.ui.tsx     flow-local output UI via `defineFlowUi`; `components/` holds RenderedImage
  fixtures.ts types.ts

jobik.config.ts   this repository's own Studio config — the example flow, 127.0.0.1:4318
```

Tests sit next to their subject as `*.test.ts(x)`; there is no separate test tree.

## Scripts

Root: `lint` is `biome check .`, `typecheck` is `tsc --noEmit`, `check` is
`turbo run lint typecheck test build`, `format` is `biome check --write .`, plus `changeset`,
`version-packages` and `release`.

Per package: `build` is `tsdown` (`@jobik/ui` adds `vite build` for the Studio bundle), `typecheck`
is `tsc --noEmit`, `test` is `vitest run --config ../../vitest.config.ts <package dir>/`.
`examples/publication` has `typecheck` and `test` only — it is private and never built.

The gate is `pnpm turbo run lint typecheck test build`. Turbo also runs the root-level `//#lint` and
`//#typecheck` tasks, so the gate covers files outside any package.

## Running the Studio

**`pnpm dev`.** It builds the Studio bundle, then serves that bundle and the API from one origin at
http://127.0.0.1:4318, against the root `jobik.config.ts` — the `examples/publication` flow. This
closes deferred findings 8-D and 11; instructions elsewhere that say the app cannot be started are
stale.

| Script | What it does |
|---|---|
| `pnpm dev` | `vite build` the bundle, then serve bundle + API on `127.0.0.1:4318`. The everyday path. |
| `pnpm dev:server` | The same server, skipping the bundle rebuild. |
| `pnpm dev:studio` | `vite dev` over `src/studio` with `/api` proxied to `127.0.0.1:4318`. Hot reload for UI work; run `pnpm dev:server` beside it. |

Arguments reach the CLI through pnpm: `pnpm dev -- --port 4400`, and likewise `--host`,
`--config <path>`, `--help`.

The pieces, for when you need to drive it yourself:

- `packages/ui/src/server/studioAssets.ts` — `jobikStudioAssetRoutes` serves `dist/studio` (`GET /`
  is `index.html`, `assets/*` are immutable, every path is confined to the bundle directory, and
  `/api/*` is never shadowed). `jobikStudioServerRoutes` is
  `[...jobikAllRoutes, ...jobikStudioAssetRoutes]` — the whole app. Its wildcard route must stay
  last in any route array, or nothing after it is reachable. There is deliberately **no SPA
  fallback**: the Studio has no client-side router, so an unknown path is a 404, not a blank shell.
- `packages/ui/src/server/cli.ts` — `runJobikCli`, which is also what `@jobik/ui`'s `bin`
  (`jobik-studio`) runs. That is how a consumer of the published package opens the Studio, and it
  is the reason `dist/studio` is no longer dead weight in the tarball.
- `packages/ui/scripts/dev.mjs` — what `pnpm dev` actually executes.
- The bundle is located relative to the installed package, never to `process.cwd()`. If it has not
  been built, page requests answer `503` with the command to run and the API keeps working.

One trap that costs a session if you meet it cold: **workspace sources cannot be loaded by plain
Node.** The barrels import `./config.js` while the in-workspace `exports` maps point at `src/*.ts`,
and Node's type stripping does not rewrite `.js` to `.ts`, so `import()` of a `src/**/*.ts` entry
dies with `ERR_MODULE_NOT_FOUND` — the root `jobik.config.ts` included, since it imports
`@jobik/ui/server`. `packages/ui/scripts/dev.mjs` is the answer: a `registerHooks` resolver that
retries a failed `.js` specifier as `.ts`. It is development-only and does not ship — an installed
package has no such problem, because its `exports` point at `dist`. Vitest and a bundler resolve
these on their own.

## Design lives in Claude Design, not in this repo

The approved Studio UI design is **not** a file in this repository. It lives in Claude Design:

| | |
|---|---|
| Project | `Jobik Studio UI Design` |
| Project ID | `34cbfcac-8d29-47b2-b4c7-592c96aac165` |
| URL | https://claude.ai/design/p/34cbfcac-8d29-47b2-b4c7-592c96aac165?file=Jobik+Studio.dc.html |
| Design file | `Jobik Studio.dc.html` — every artboard |
| `support.js` | generated Claude Design canvas runtime, no design content, ignore it |

Read it with the `DesignSync` tool: `get_file` with that `projectId` and path `Jobik Studio.dc.html`.
It needs design-system authorization — run `/design-login` first if the tool reports it is not
authorized. The `claude-design` MCP server, when configured, needs the same login.

Six artboards: `Studio — default` (1640×980), `Studio — panels collapsed`, `Studio — run in
progress`, `Node states`, `Run panel — states`, `Output viewer`. Canvas props: `accent`,
`showDotGrid`, `edgeShape` (`curved` | `stepped`).

**The design file is the source of truth for layout, tokens, and states.** Do not invent colours,
spacing, or new UI states — read the artboard first. If code and design disagree, the design wins —
but check `DEFERRED.md` first: several disagreements are already known and deliberately deferred.

## Docs

- `.superpowers/waves/2026-08-29-jobik-v1/closeout/DEFERRED.md` — everything v1 found, verified and
  deliberately did not fix, each an operator decision. Read it before claiming any behaviour works.
  Note: `.superpowers/` is gitignored, so this file is local-only, as are the closeout reports it
  cites.
- `docs/superpowers/specs/2026-08-28-jobik-design.md` — the full spec. Its `## Studio UI` section
  mirrors the design in prose; keep it in sync when the design changes. Note: `docs/superpowers/` is
  gitignored, so this file is local-only.
- `docs/jobik-ui-design-prompt.md` — the brief the design was generated from. History only; do not
  treat it as current.

## Stack

pnpm workspaces (`packages/*`, `examples/*`) · Turborepo · tsdown · Vite · vitest · biome ·
Changesets. Node >= 24, ESM only.

- Turbo runs `build`, `typecheck`, `test`, `lint`. Only `build` carries `dependsOn: ["^build"]` and `outputs: ["dist/**"]`; the other three are flat.
- tsdown builds both packages: ESM only, `dts: true`, `exports: { devExports: true }`. It generates `exports` and `publishConfig.exports` — never hand-edit those blocks. Inside the workspace they point at `src`, which is why typecheck and tests never wait on a build and no `dist/` exists until someone runs `turbo run build`.
- Vite builds the Studio bundle into `packages/ui/dist/studio`, and its build API is the runtime bundler for `flow.ui.tsx`.
- The repository gate is `pnpm turbo run lint typecheck test build`.
- Changesets: `@jobik/core` and `@jobik/ui` are linked, released manually, starting at `0.1.0`.

## Rules for editing here

- `packages/core/src/errors.ts` is **frozen**. Construct these classes; never edit the file. An
  error that needs a field the taxonomy does not declare is a spec gap to report, not a line to add.
  Its header also fixes the serialisation policy: never put `toJSON()` output on the wire.
- The three barrels — `packages/core/src/index.ts`, `packages/ui/src/index.ts`,
  `packages/ui/src/server/index.ts` — are **append-only**. Add export lines; edit none.
- Manifest `exports` blocks are generated, and `dist/` does not exist until a build — see *Stack*.

## Conventions

- TypeScript, ESM, `import.meta.filename` for path resolution. Absolute paths only in bindings.
- `@jobik/core` is namespace-imported: `import * as jobik from '@jobik/core'`. It exports `start`, `node`, `flow`, and the tagged error classes at top level — no `jobik` object export, no default export. The `jobik.` prefix is the import alias, not something the package owns. `@jobik/ui` and `@jobik/ui/server` keep named imports for their single define-functions.
- Zod v4 is the schema system and a peer dependency of `@jobik/core`.
- Errors use `errore` (`import * as errore from 'errore'`): expected failures are returned as `T | Error`, never thrown. See the `errore` skill.
- The editor is React Flow based, desktop-first, dark only.
