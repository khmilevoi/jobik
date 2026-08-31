/**
 * `pnpm dev` at the repository root: the Studio server, run straight from TypeScript sources.
 *
 * It runs the same command as the published `bin` — `runJobikCli` — but reaches it through `src`
 * rather than through `dist`, so a server change is one restart away rather than a `tsdown` away.
 *
 * The resolution hook is what makes that possible, and it exists for one trap. Every source file
 * here imports its siblings with a `.js` specifier (`./config.js`) while the in-workspace
 * `exports` maps point at `src/*.ts`. Node strips types happily, but it does not rewrite `.js` to
 * `.ts`, so `import()` of any `src/**` entry — including this repository's own `jobik.config.ts`,
 * which imports `@jobik/ui/server` — dies with `ERR_MODULE_NOT_FOUND`. Until now only vitest and a
 * bundler could resolve these. The hook is one rule: when the default resolution of a `.js`-shaped
 * specifier fails, try the TypeScript extension it stands for. Nothing else is intercepted.
 *
 * The Studio bundle itself still has to be built, because it is a browser bundle; the root `dev`
 * script builds it first, and the server says so plainly if it is missing.
 *
 * Development only — this file does not ship. Arguments are the CLI's:
 * `pnpm dev -- --port 4400`, `--config`, `--host`, `--help`.
 */
import { registerHooks } from 'node:module'

const REWRITES = { '.js': '.ts', '.mjs': '.mts', '.cjs': '.cts' }

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      const from = Object.keys(REWRITES).find((extension) => specifier.endsWith(extension))
      if (from === undefined || error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
      return nextResolve(`${specifier.slice(0, -from.length)}${REWRITES[from]}`, context)
    }
  },
})

const { runJobikCli } = await import('../src/server/cli.ts')

const { code } = await runJobikCli(process.argv.slice(2))
process.exitCode = code
