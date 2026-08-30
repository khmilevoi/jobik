import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { JOBIK_DEFAULT_HOST, JOBIK_DEFAULT_PORT } from './config.js'
import { describeFlow } from './descriptor.js'
import { discoverFlows, loadJobikConfig } from './discovery.js'

/** `server` → `src` → `ui` → `packages` → the repository root. */
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const configPath = path.resolve(repositoryRoot, 'jobik.config.ts')

describe("the repository's own jobik.config.ts", () => {
  it('declares the spec host and port', async () => {
    const config = await loadJobikConfig({ path: configPath })
    expect(config.server).toEqual({ host: JOBIK_DEFAULT_HOST, port: JOBIK_DEFAULT_PORT })
  })

  it('points at the publication example, with both entrypoints absolute', async () => {
    const config = await loadJobikConfig({ path: configPath })
    expect(config.flows).toEqual([
      {
        binding: publicationFixture.bindingPath,
        ui: path.resolve(publicationFixture.root, 'flow.ui.tsx'),
      },
    ])
    for (const entry of config.flows) {
      expect(path.isAbsolute(entry.binding)).toBe(true)
      expect(path.isAbsolute(entry.ui)).toBe(true)
    }
  })

  it('discovers the publication flow through it', async () => {
    const registry = await discoverFlows({ config: await loadJobikConfig({ path: configPath }) })
    expect(registry.flows.map((flow) => flow.id)).toEqual(['publication'])

    const descriptor = describeFlow(registry.flows[0])
    if (descriptor instanceof Error) throw descriptor
    expect(descriptor.nodes.map((node) => node.id)).toEqual(publicationFixture.nodeIds)
    expect(descriptor.startIds).toEqual([publicationFixture.startId])
  })
})
