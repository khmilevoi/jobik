# Jobik

Node-first TypeScript tool for authoring, editing, and running typed flows. Node definitions live in
TypeScript; mutable graph composition lives in one versioned JSON file per flow. Two packages:
`@jobik/core` (Zod flow definitions, document validation/migration, errore-based errors, execution)
and `@jobik/ui` (React Studio editor plus `@jobik/ui/server`).

Nothing is implemented yet. The spec and the UI design are both done.

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
spacing, or new UI states — read the artboard first. If code and design disagree, the design wins.

## Docs

- `docs/superpowers/specs/2026-08-28-jobik-design.md` — the full spec. Its `## Studio UI` section mirrors the design in prose; keep it in sync when the design changes. Note: `docs/superpowers/` is gitignored, so this file is local-only.
- `docs/jobik-ui-design-prompt.md` — the brief the design was generated from. History only; do not treat it as current.

## Stack

pnpm workspaces (`packages/*`, `examples/*`) · Turborepo · tsdown · Vite · vitest · biome ·
Changesets. Node >= 24, ESM only.

- Turbo runs `build`, `typecheck`, `test`, `lint`. Only `build` carries `dependsOn: ["^build"]` and `outputs: ["dist/**"]`; the other three are flat.
- tsdown builds both packages: ESM only, `dts: true`, `exports: { devExports: true }`. It generates `exports` and `publishConfig.exports` — never hand-edit those blocks. Inside the workspace they point at `src`, which is why typecheck and tests never wait on a build and no `dist/` exists until someone runs `turbo run build`.
- Vite builds the Studio bundle into `packages/ui/dist/studio`, and its build API is the runtime bundler for `flow.ui.tsx`.
- The repository gate is `pnpm turbo run lint typecheck test build`.
- Changesets: `@jobik/core` and `@jobik/ui` are linked, released manually, starting at `0.1.0`.

## Conventions

- TypeScript, ESM, `import.meta.filename` for path resolution. Absolute paths only in bindings.
- `@jobik/core` is namespace-imported: `import * as jobik from '@jobik/core'`. It exports `start`, `node`, `flow`, and the tagged error classes at top level — no `jobik` object export, no default export. The `jobik.` prefix is the import alias, not something the package owns. `@jobik/ui` and `@jobik/ui/server` keep named imports for their single define-functions.
- Zod v4 is the schema system and a peer dependency of `@jobik/core`.
- Errors use `errore` (`import * as errore from 'errore'`): expected failures are returned as `T | Error`, never thrown. See the `errore` skill.
- The editor is React Flow based, desktop-first, dark only.
