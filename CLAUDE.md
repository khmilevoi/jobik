# Jobik

Node-first TypeScript tool for authoring, editing, and running typed flows. Node definitions live in
TypeScript; mutable graph composition lives in one versioned JSON file per flow. Two packages:
`@jobik/core` (Zod flow definitions, document validation/migration, errore-based errors, execution)
and `@jobik/ui` (React Studio editor plus `@jobik/ui/server`).

v1 is implemented and both packages are at `0.1.0`. `@jobik/core` covers authoring, the
`flow.jobik.json` document, graph validation, the Zod-to-control UI schema and the execution engine.
`@jobik/ui` covers the Studio — shell, React Flow canvas, run panel, output viewer, streaming client
— and `@jobik/ui/server` serves the whole API. `examples/showcase` is the `@jobik/examples` package
and holds the Studio config; its `publication` flow is the one every artboard in the design shows.
What is *not* finished
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
  tokens.ts tokens.css   the design tokens, in TypeScript and as `--jbk-*` custom properties
  globalStyles.tsx globalStyles.css   the reset and the four keyframes
  cx.ts css.d.ts  the class-name joiner; the ambient `*.module.css` declaration
  cssModuleSource.ts + cssModuleUsage/cssModuleValues.test.ts   the styling gates
  primitives/     the `3A` button system — Button, IconButton, InlineAction, ValueRow, Spinner,
                  ProgressTrack, Checkbox, Toggle, SegmentedControl, icons/, actionState.ts —
                  plus Badge, Chip, InsetWell, SectionLabel, TypeAnnotation
  shell/          StudioFrame, TopBar, FlowsSidebar (flows, nodes, inventory, run history),
                  RunDock, PanelHeader, DockedControls
  canvas/         React Flow canvas: FlowCanvas, NodeCard*, FieldEdge/FieldHandle, edge paths
  run/            run panel views, typed input controls, input validation, RunLogSection
  output/         output viewer, the `2A` OutputDock, `defineFlowUi`, value formatting
  modals/         artboard `3C`: ModalShell plus Validation, Download, StackTrace, CancelRun
  client/         JobikClient, NDJSON stream decoding, wire types
  studio/         StudioApp/Studio, session hooks, run presenter, extension loader,
                  plus `main.tsx` + `index.html` — the Vite entry for the bundled Studio
  server/         `@jobik/ui/server`: config, discovery, flowService, httpServer, routes,
                  runRoutes, runRegistry, extensionBundle, wire projection and safety

examples/showcase/    `@jobik/examples` — one package, one flow per subdirectory
  jobik.config.ts     the Studio config: publication, pokedex, forecast, on 127.0.0.1:4318
  publication/        the flow every artboard shows
    index.ts          the binding: `start1` -> `render` -> `publish`, bound to an absolute path
    nodes/            publicationInput, imageOut, httpSink, markdown, and the sidebar inventory
    flow.jobik.json   the versioned document
    flow.ui.tsx       flow-local output UI via `defineFlowUi`; `components/` holds RenderedImage
    fixtures.ts types.ts
  pokedex/ forecast/  the same five files each
```

`package.json`, `tsconfig.json` and `jest-dom.d.ts` stay at `examples/showcase/` root; everything
that belongs to one flow lives under that flow's directory.

Tests sit next to their subject as `*.test.ts(x)`; there is no separate test tree.

Inside every `packages/ui/src/<area>/`, **a component gets a folder named after it and a plain
module does not**: `NodeCard/NodeCard.tsx`, `NodeCard/NodeCard.module.css` and
`NodeCard/NodeCard.test.tsx` together, while `cardChrome.ts`, `canvasTokens.ts`, `types.ts`,
`format.ts` and the like stay flat beside the directory barrel. There are no per-component
`index.ts` files — import `./NodeCard/NodeCard.js` directly. Directory barrels (`canvas/index.ts`,
`run/index.ts`, …) are ordinary files and absorb the paths; only the three barrels named under
*Rules for editing here* are append-only.

`studio/Studio.ts` and `studio/StudioApp.ts` are one-line re-export shims and are **permanent**:
`packages/ui/src/index.ts` is append-only and names those two paths directly, and neither will
resolve to a directory. Do not delete them, and do not add a third — a barrel line naming a
component you are moving is something to report, not to edit around.

## Scripts

Root: `lint` is `biome check .`, `typecheck` is `tsc --noEmit`, `check` is
`turbo run lint typecheck test build`, `format` is `biome check --write .`, plus `changeset`,
`version-packages` and `release`.

Per package: `build` is `tsdown` (`@jobik/ui` adds `vite build` for the Studio bundle), `typecheck`
is `tsc --noEmit`, `test` is `vitest run --config ../../vitest.config.ts <package dir>/`.
`examples/showcase` has `typecheck` and `test` only — it is private and never built.

The gate is `pnpm turbo run lint typecheck test build`. Turbo also runs the root-level `//#lint` and
`//#typecheck` tasks, so the gate covers files outside any package.

## Running the Studio

**`pnpm dev`.** It builds the Studio bundle, then serves that bundle and the API from one origin at
http://127.0.0.1:4318. The config is `examples/showcase/jobik.config.ts`, and the root `dev` and
`dev:server` scripts pass it with `--config` — the CLI resolves a config against `process.cwd()`
only and never searches up the tree, so that flag is not optional. This closes deferred findings
8-D and 11; instructions elsewhere that say the app cannot be started are stale.

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
dies with `ERR_MODULE_NOT_FOUND` — `examples/showcase/jobik.config.ts` included, since it imports
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

**Ten artboards**, in document order. The first four carry a prefix and are the newer additions;
where one of them disagrees with an older artboard, the newer wins:

| Artboard | What it fixes |
|---|---|
| `3A` Buttons | copy and download as state matrices — default / working / copied / failed and default / preparing / transferring / saved — across seven shapes, plus the in-button loader |
| `3B` | one rule: a button loads only when nothing around it reports progress; otherwise it drops to `opacity:.45` and changes nothing else |
| `3C` Modals | Validation, Download output, Stack trace, Cancel run |
| `2A` Studio — full page, output open | 1640×1080; the bottom output dock, run history in the sidebar, the run pill in the top bar, the `Log` section in the run panel |
| Studio — default | 1640×980, the idle shell |
| Studio — panels collapsed | both sidebars docked into the top bar |
| Studio — run in progress | the canvas while the run streams |
| Node states | `queued · running · ok · failed · cached` |
| Run panel — states | the 320px dock: running / failed / completed |
| Output viewer | images and typed values from run `#221` |

Canvas props: `accent`, `showDotGrid`, `edgeShape` (`curved` | `stepped`), `--dot: #191c1f`.

**Motion, because it is easy to get wrong in both directions.** The design has exactly four
keyframes — `jspin .7s`, `jdash .8s`, `jshim 1.5s`, `jpulse 1.5s`/`1s` — and **zero CSS
transitions**, no `cubic-bezier` and no `prefers-reduced-motion` block. The rule behind that: a
thing moves because work is in progress, never because a state changed. Do not add a hover or
state-change transition; do make sure the four loops actually run where the design puts them, read
from the `--jbk-motion-*` tokens. The one deliberate departure from the motion rules is a
`prefers-reduced-motion` block in `globalStyles.css`, which the design does not have and
accessibility requires.

**The design file is the source of truth for layout, tokens, and states.** Do not invent colours,
spacing, or new UI states — read the artboard first. If code and design disagree, the design wins —
but check `DEFERRED.md` first: several disagreements are already known and deliberately deferred.

**A second deliberate departure, in copy rather than motion.** `CancelRunModal` does not print the
design's own cancel sentence (`07-copy.md` §4.5), which promises the in-flight node finishes its
current work and that completed nodes stay cached so a re-run resumes from there. Both halves are
false in v1: `run/execute.ts` settles the run on `Promise.race([invoked, aborted])` without waiting
for the handler, and `cached` is unreachable (`DEFERRED.md` §3), so a re-run executes everything
again. This dialog is the one place a user is told what cancelling costs, so it states what the
engine does. Restore the design's sentence when the engine earns it, not before.

## Styling

`@jobik/ui` styles itself with **CSS Modules**. `tokens.ts` is still the TypeScript-side source of
the design values; `tokens.css` restates every one as a `--jbk-*` custom property, and that is what
stylesheets read. `primitives/`, `shell/`, `canvas/`, `run/`, `output/`, `modals/` and `studio/` each
add their own `<name>Tokens.ts` + `<name>Tokens.css` pair, imported once from the directory barrel.
A value two directories read belongs in `tokens.ts`, not in one of theirs — a custom property exists
only while its own stylesheet is on the page.

Two things live in `globalStyles.css` rather than in any module, because they must reach every
scroll container and every animated element without one: the **scrollbar** (the `scrollbar` token
group, standard `scrollbar-width`/`scrollbar-color` with a `::-webkit-*` fallback inside
`@supports not (scrollbar-color: auto)`) and the **`prefers-reduced-motion`** block. Do not restyle
a scrollbar locally; make the region scrollable and let it inherit. That file is mirrored into
`STUDIO_GLOBAL_CSS` and a test fails when the two drift, so edit both.

The invariants, all of them enforced by a test rather than by the compiler:

- `<Component>/<Component>.module.css` beside its component, bound as `s`:
  `import s from './NodeCard.module.css'`. No other binding name.
- **`var(--jbk-…)` only.** A colour literal is banned outright in a `*.module.css`, and
  `font-size`, `font-family` and `border-radius` must read a token — those sets are closed. A
  component source may not spell a colour either. `padding`, `margin`, `gap`, `width` and `height`
  stay literal; no token ever carried them.
- **Literal class access only** — `s.nodeCard`, never `` s[`state-${x}`] `` or `s[variant]`. A
  computed key blinds the gate, so it is a failure in itself.
- **Variant maps are written out in full** with `satisfies Record<Foo, string>`, so a missing case
  is a type error and every value is a read the gate can see.
- A genuinely dynamic value — a progress width, a caller's colour — rides in as a custom property
  through `style`, with the rule in the `.module.css`. That is the only inline style left.

Three gates, in `packages/ui/src`:

| Gate | Stops |
|---|---|
| `tokens.css.test.ts` (and the per-directory copies) | `tokens.ts` and `tokens.css` drifting apart — both directions |
| `cssModuleValues.test.ts` | a design value stated in a stylesheet or a source instead of read from a token |
| `cssModuleUsage.test.ts` | `s.nodeCrad` — a class read but not defined, or defined and read by nobody |

There is deliberately **no generated `*.module.css.d.ts`**: `css.d.ts` declares the module as
`Record<string, string>`, so a typo compiles and `cssModuleUsage.test.ts` is what catches it. That
trade was chosen; do not add a generator.

`tsdown` now emits `dist/style.css`, and writes its `exports` entry itself on every build — see
*Stack*, and never hand-edit it. **Nobody imports that file.** The Studio reaches a browser one
way: `jobik-studio` serves the prebuilt `dist/studio`, whose own Vite pipeline emits the CSS its
`index.html` links. A flow's `flow.ui.tsx` does not pull it in either — `extensionBundle.ts` keeps
`@jobik/ui` external, so a flow-local component is styled by the Studio page hosting it. The file
is a by-product of building the browser entry, which exists for authoring types.

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
- `flow().meta({ … })` is the open bag for anything a surface needs and the graph cannot say. It is
  inert at run time. Its one field today is `source` — pass `import.meta.filename`, absolute — and
  it is what the Studio's top-bar badge prints; leave it out and the badge falls back to the
  binding entrypoint's own file name.
- Errors use `errore` (`import * as errore from 'errore'`): expected failures are returned as `T | Error`, never thrown. See the `errore` skill.
- The editor is React Flow based, desktop-first, dark only, and styled with CSS Modules — see *Styling*.

<!-- reatom-audit -->
## Reatom audit

This project uses Reatom, and the `reatom` plugin ships an audit that checks
TypeScript against the Reatom rule registry.

Run `/reatom-audit` when you finish a change that touched Reatom code — atoms,
computed values, actions, async flows, effects, `reatomComponent` — and before
you report that work as done. It audits changed TypeScript only, and it is
incremental, so re-running it after a small follow-up edit is cheap. Skip it
entirely for changes that touch no Reatom code.

Two other forms exist: `/reatom-audit all` sweeps every TypeScript file in the
repository, and `/reatom-audit <paths>` audits exactly the files you name,
whether or not they changed. Both are for the operator to invoke; neither is
part of finishing an ordinary change.
<!-- /reatom-audit -->
