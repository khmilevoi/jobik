#!/usr/bin/env node
/**
 * The `@jobik/ui` command: `npx jobik-studio` in a project that has a `jobik.config.ts`.
 *
 * It reaches `dist/server.mjs` by relative path rather than through the `@jobik/ui/server`
 * specifier on purpose. Inside this workspace that specifier resolves to `src/server/index.ts`,
 * which plain Node cannot load; the relative path names the same built file in an installed
 * package and in the repository after `pnpm --filter @jobik/ui run build`, so the command can be
 * exercised in both places. Everything it does lives in `runJobikCli`.
 */
import { runJobikCli } from '../dist/server.mjs'

const { code } = await runJobikCli(process.argv.slice(2))
process.exitCode = code
