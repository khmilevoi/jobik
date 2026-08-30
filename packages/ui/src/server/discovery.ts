import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as jobik from '@jobik/core'
import { type JobikConfig, normaliseJobikConfig } from './config.js'

/**
 * Flow discovery: load a `jobik.config.ts`, then load exactly the binding entrypoints it names.
 * The server never scans a directory — the configured pairs are the whole flow universe.
 *
 * Both functions THROW. A config or a binding entrypoint that cannot be loaded is an author error
 * that must stop the server from starting; it never crosses to a browser and so needs no tag from
 * the frozen taxonomy. Everything a request can fail on is returned as a value, in `flowService.ts`.
 *
 * Every path on a `DiscoveredFlow` is ABSOLUTE and stays Node-side. `descriptor.ts` is the only
 * thing that turns a discovered flow into something a browser may see.
 */

export type DiscoveredFlow = {
  /** The browser-facing handle: the flow's own name. Two flows may not share one. */
  readonly id: string
  /** Node-only: holds the node definitions, and therefore the handlers. */
  readonly flow: jobik.BoundFlow
  /** Absolute. Node-only. */
  readonly bindingPath: string
  /**
   * Absolute. Node-only. Recorded so P13 can hand it to Vite's build API; never imported here —
   * Node's type stripping does not transform JSX, and bundling is not this plan's.
   */
  readonly uiPath: string
  /** Absolute. The flow document this flow is bound to; equal to `flow.path`. Node-only. */
  readonly documentPath: string
}

export interface FlowRegistry {
  /** Discovered flows in config order. */
  readonly flows: readonly DiscoveredFlow[]
  get(id: string): DiscoveredFlow | undefined
}

/**
 * A specifier the runtime can import. `pathToFileURL` is not optional: on Windows a bare
 * `C:\...` path is not a valid ES module specifier.
 */
function specifierOf(absolutePath: string): string {
  return pathToFileURL(absolutePath).href
}

/**
 * Load and validate a configuration module. Node >= 24 strips the types of a `.ts` entrypoint, so
 * `jobik.config.ts` needs no build step.
 */
export async function loadJobikConfig(args: { path: string }): Promise<JobikConfig> {
  const module = (await import(specifierOf(args.path))) as { default?: unknown }
  if (module.default === undefined) {
    throw new TypeError(`jobik config: '${args.path}' has no default export`)
  }
  return normaliseJobikConfig(module.default)
}

/** A structural check: the module on disk is untrusted, even when it was written by the author. */
function isBoundFlow(value: unknown): value is jobik.BoundFlow {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { name?: unknown; path?: unknown; nodes?: unknown }
  return (
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.path === 'string' &&
    path.isAbsolute(candidate.path) &&
    typeof candidate.nodes === 'object' &&
    candidate.nodes !== null
  )
}

/**
 * Load every configured binding entrypoint and index the bound flows by name.
 *
 * The imports run concurrently; `Promise.all` preserves config order, which is the order the
 * editor's `Flows` list shows.
 */
export async function discoverFlows(args: { config: JobikConfig }): Promise<FlowRegistry> {
  const loaded = await Promise.all(
    args.config.flows.map(async (entry) => ({
      entry,
      module: (await import(specifierOf(entry.binding))) as { default?: unknown },
    })),
  )

  const flows: DiscoveredFlow[] = []
  const byId = new Map<string, DiscoveredFlow>()
  for (const { entry, module } of loaded) {
    const flow = module.default
    if (!isBoundFlow(flow)) {
      throw new TypeError(`jobik config: '${entry.binding}' must default-export a bound flow`)
    }
    if (byId.has(flow.name)) {
      throw new TypeError(`jobik config: two flows are named '${flow.name}'`)
    }
    const discovered: DiscoveredFlow = {
      id: flow.name,
      flow,
      bindingPath: entry.binding,
      uiPath: entry.ui,
      documentPath: flow.path,
    }
    flows.push(discovered)
    byId.set(discovered.id, discovered)
  }

  return { flows, get: (id) => byId.get(id) }
}
