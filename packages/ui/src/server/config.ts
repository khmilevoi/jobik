import path from 'node:path'

/**
 * The `jobik.config.ts` shape.
 *
 * A config lists the server host and port and one absolute `binding`/`ui` pair per flow. Discovery
 * is limited to exactly these pairs — the server never scans a directory.
 *
 * Validation THROWS a `TypeError`. That is deliberate and matches `flow.ts`'s `bind()`: a malformed
 * config is an author error at module scope, discovered before the server starts and never
 * serialised to a browser, so it needs no entry in the frozen error taxonomy.
 */

/** The spec's default host. `jobik` is a localhost developer tool with no auth. */
export const JOBIK_DEFAULT_HOST = '127.0.0.1'

/** The spec's default port. */
export const JOBIK_DEFAULT_PORT = 4318

/** One flow: its Node binding entrypoint and its browser UI entrypoint. Both absolute. */
export type JobikFlowEntry = {
  /** Absolute path to the flow binding entrypoint, e.g. `.../publication/index.ts`. */
  readonly binding: string
  /**
   * Absolute path to the flow-local UI entrypoint, e.g. `.../publication/flow.ui.tsx`.
   * Carried, never imported here: Node cannot type-strip JSX, and bundling it is P13's.
   */
  readonly ui: string
}

export type JobikServerOptions = {
  readonly host: string
  /** `0` asks the OS for an ephemeral port, which is what the tests use. */
  readonly port: number
}

/** A validated, frozen configuration. */
export type JobikConfig = {
  readonly server: JobikServerOptions
  readonly flows: readonly JobikFlowEntry[]
}

/** What an author writes. `server` and its two fields are optional and default to the spec values. */
export type JobikConfigInput = {
  readonly server?: { readonly host?: string; readonly port?: number }
  readonly flows: readonly JobikFlowEntry[]
}

function fail(reason: string): never {
  throw new TypeError(`jobik config: ${reason}`)
}

function absolutePathOf(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`)
  }
  if (!path.isAbsolute(value)) {
    fail(`${label} must be an absolute path, received '${value}'`)
  }
  return value
}

/**
 * Validate and freeze any candidate configuration value.
 *
 * `defineJobikConfig` calls it on what an author passes; `loadJobikConfig` calls it again on the
 * default export of a config module, because a module on disk is untrusted input even when it was
 * meant to have gone through `defineJobikConfig`.
 */
export function normaliseJobikConfig(input: unknown): JobikConfig {
  if (typeof input !== 'object' || input === null) fail('expected a configuration object')
  const record = input as { server?: unknown; flows?: unknown }

  if (!Array.isArray(record.flows)) fail('`flows` must be an array')
  const flows = record.flows.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) fail(`flows[${index}] must be an object`)
    const candidate = entry as { binding?: unknown; ui?: unknown }
    return Object.freeze({
      binding: absolutePathOf(candidate.binding, `flows[${index}].binding`),
      ui: absolutePathOf(candidate.ui, `flows[${index}].ui`),
    })
  })

  const bindings = new Set<string>()
  for (const entry of flows) {
    if (bindings.has(entry.binding)) fail(`duplicate binding entrypoint '${entry.binding}'`)
    bindings.add(entry.binding)
  }

  if (
    record.server !== undefined &&
    (typeof record.server !== 'object' || record.server === null)
  ) {
    fail('`server` must be an object')
  }
  const server = (record.server ?? {}) as { host?: unknown; port?: unknown }

  const host = server.host ?? JOBIK_DEFAULT_HOST
  if (typeof host !== 'string' || host.length === 0) {
    fail('server.host must be a non-empty string')
  }
  const port = server.port ?? JOBIK_DEFAULT_PORT
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
    fail('server.port must be an integer')
  }

  return Object.freeze({
    server: Object.freeze({ host, port }),
    flows: Object.freeze(flows) as readonly JobikFlowEntry[],
  })
}

/**
 * Declare a Jobik configuration. Used once, at module scope, in `jobik.config.ts`:
 *
 * ```ts
 * import path from 'node:path'
 * import { defineJobikConfig } from '@jobik/ui/server'
 *
 * const root = path.dirname(import.meta.filename)
 *
 * export default defineJobikConfig({
 *   server: { host: '127.0.0.1', port: 4318 },
 *   flows: [
 *     {
 *       binding: path.resolve(root, 'flows/publication/index.ts'),
 *       ui: path.resolve(root, 'flows/publication/flow.ui.tsx'),
 *     },
 *   ],
 * })
 * ```
 */
export function defineJobikConfig(input: JobikConfigInput): JobikConfig {
  return normaliseJobikConfig(input)
}
