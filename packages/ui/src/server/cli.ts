import * as fs from 'node:fs/promises'
import path from 'node:path'
import { normaliseJobikConfig } from './config.js'
import { loadJobikConfig } from './discovery.js'
import { type JobikServer, startJobikServer } from './httpServer.js'
import { jobikStudioServerRoutes, resolveStudioBundleDir } from './studioAssets.js'

/**
 * The `jobik-studio` command: load a config, discover its flows, serve the API and the Studio.
 *
 * This is the whole of what a consumer needs in order to open the Studio — the package's `bin`
 * is a three-line wrapper around `runJobikCli`, and this repository's own `pnpm dev` calls it
 * directly. Both were missing until now, which is what made the shipped `dist/studio` unreachable.
 *
 * Config paths resolve against `process.cwd()`, and only here: the user typed the path (or typed
 * nothing and meant "the config in the directory I am standing in"), so their directory is the
 * right frame. Nothing else in the server resolves against `cwd` — see `studioAssets.ts`.
 *
 * The one failure mode this cannot smooth over is the loader: `loadJobikConfig` imports the config
 * module, and Node loads only what Node can load. A config written in TypeScript is fine (Node
 * strips types), but a config that imports workspace TypeScript sources through `.js` specifiers
 * is not, because Node does not rewrite the extension. That is why this repository's `pnpm dev`
 * goes through `packages/ui/scripts/dev.mjs` rather than calling the `bin` directly.
 */

/** Tried in order when `--config` is not given, against the current working directory. */
const DEFAULT_CONFIG_NAMES: readonly string[] = [
  'jobik.config.ts',
  'jobik.config.mts',
  'jobik.config.js',
  'jobik.config.mjs',
]

const USAGE = [
  'jobik-studio — serve a Jobik flow configuration and the Studio editor.',
  '',
  'Usage: jobik-studio [options]',
  '',
  '  --config <path>  Config module to load. Default: jobik.config.{ts,mts,js,mjs} in the',
  '                   current directory.',
  '  --host <host>    Override the config host. Default: the config value, else 127.0.0.1.',
  '  --port <port>    Override the config port. Default: the config value, else 4318.',
  '  --help, -h       Print this message.',
  '',
].join('\n')

type CliOptions = {
  readonly help: boolean
  readonly config?: string
  readonly host?: string
  readonly port?: number
}

/**
 * Parse `argv`. Returns the options or an `Error` describing what is wrong with them — a mistyped
 * flag is an expected failure of a user-facing command, not a crash.
 */
function parseArgv(argv: readonly string[]): CliOptions | Error {
  let help = false
  let config: string | undefined
  let host: string | undefined
  let port: number | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--help' || flag === '-h') {
      help = true
      continue
    }
    // A package manager forwards its own end-of-options separator into the script, so
    // `pnpm dev -- --port 4400` — the invocation the root README and CLAUDE.md document — arrives
    // here with a bare `--` ahead of the real flags. It marks nothing for a CLI that takes no
    // positional arguments, so skip it rather than reporting it as an unknown option.
    if (flag === '--') continue
    const value = argv[index + 1]
    if (flag !== '--config' && flag !== '--host' && flag !== '--port') {
      return new Error(`unknown option '${flag}'`)
    }
    if (value === undefined || value.startsWith('-')) {
      return new Error(`option '${flag}' needs a value`)
    }
    index += 1
    if (flag === '--config') config = value
    else if (flag === '--host') host = value
    else {
      port = Number(value)
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        return new Error(`option '--port' needs an integer between 0 and 65535, got '${value}'`)
      }
    }
  }

  return { help, config, host, port }
}

async function exists(candidate: string): Promise<boolean> {
  return await fs
    .stat(candidate)
    .then(() => true)
    .catch(() => false)
}

/** The config module to load, or an `Error` naming what was looked for and not found. */
async function locateConfig(explicit: string | undefined): Promise<string | Error> {
  if (explicit !== undefined) {
    const resolved = path.resolve(process.cwd(), explicit)
    if (!(await exists(resolved))) return new Error(`no config at '${resolved}'`)
    return resolved
  }
  for (const name of DEFAULT_CONFIG_NAMES) {
    const candidate = path.resolve(process.cwd(), name)
    if (await exists(candidate)) return candidate
  }
  return new Error(
    `no config found in '${process.cwd()}' (looked for ${DEFAULT_CONFIG_NAMES.join(', ')}); ` +
      'pass --config <path>',
  )
}

/**
 * Start the server described by `argv` and return the process exit code.
 *
 * It returns as soon as the server is listening — the listening socket is what keeps the process
 * alive, and `SIGINT`/`SIGTERM` close it. `close` is on the returned handle for an embedder that
 * would rather own the lifecycle.
 */
export async function runJobikCli(
  argv: readonly string[],
): Promise<{ readonly code: number; readonly server?: JobikServer }> {
  const options = parseArgv(argv)
  if (options instanceof Error) {
    console.error(`jobik-studio: ${options.message}\n\n${USAGE}`)
    return { code: 2 }
  }
  if (options.help) {
    console.log(USAGE)
    return { code: 0 }
  }

  const configPath = await locateConfig(options.config)
  if (configPath instanceof Error) {
    console.error(`jobik-studio: ${configPath.message}`)
    return { code: 1 }
  }

  // `loadJobikConfig` and `discoverFlows` THROW by design: a config or a binding that cannot be
  // loaded is an author error that must stop the server. The command's job is to report it as a
  // message rather than as a stack.
  let server: JobikServer
  try {
    const loaded = await loadJobikConfig({ path: configPath })
    const config =
      options.host === undefined && options.port === undefined
        ? loaded
        : normaliseJobikConfig({
            server: {
              host: options.host ?? loaded.server.host,
              port: options.port ?? loaded.server.port,
            },
            flows: loaded.flows,
          })
    server = await startJobikServer({ config, routes: jobikStudioServerRoutes })
  } catch (error) {
    console.error(`jobik-studio: ${error instanceof Error ? error.message : String(error)}`)
    return { code: 1 }
  }

  if ((await resolveStudioBundleDir()) === undefined) {
    console.warn(
      'jobik-studio: the Studio bundle is not built, so only the API will answer. Build it with ' +
        '`pnpm --filter @jobik/ui run build:studio`.',
    )
  }

  const flows = server.registry.flows.map((flow) => flow.id).join(', ')
  console.log(`jobik-studio: ${server.url}  (config ${configPath})`)
  console.log(`jobik-studio: flows — ${flows.length === 0 ? 'none' : flows}`)

  const stop = (): void => {
    void server.close().then(() => process.exit(0))
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  return { code: 0, server }
}
