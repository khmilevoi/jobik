import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/showcase/publication/fixtures.js'
import { JOBIK_DEFAULT_HOST, JOBIK_DEFAULT_PORT } from './config.js'
import { describeFlow } from './descriptor.js'
import { discoverFlows, loadJobikConfig } from './discovery.js'

/** `server` → `src` → `ui` → `packages` → the repository root. */
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const showcase = path.resolve(repositoryRoot, 'examples/showcase')
const configPath = path.resolve(showcase, 'jobik.config.ts')

describe("the showcase's jobik.config.ts", () => {
  it('declares the spec host and port', async () => {
    const config = await loadJobikConfig({ path: configPath })
    expect(config.server).toEqual({ host: JOBIK_DEFAULT_HOST, port: JOBIK_DEFAULT_PORT })
  })

  it('points at all three showcase flows, with both entrypoints absolute', async () => {
    const config = await loadJobikConfig({ path: configPath })
    expect(config.flows).toEqual([
      {
        binding: publicationFixture.bindingPath,
        ui: path.resolve(publicationFixture.root, 'flow.ui.tsx'),
      },
      {
        binding: path.resolve(showcase, 'pokedex/index.ts'),
        ui: path.resolve(showcase, 'pokedex/flow.ui.tsx'),
      },
      {
        binding: path.resolve(showcase, 'forecast/index.ts'),
        ui: path.resolve(showcase, 'forecast/flow.ui.tsx'),
      },
    ])
    for (const entry of config.flows) {
      expect(path.isAbsolute(entry.binding)).toBe(true)
      expect(path.isAbsolute(entry.ui)).toBe(true)
    }
  })

  it('discovers all three flows through it, in config order', async () => {
    const registry = await discoverFlows({ config: await loadJobikConfig({ path: configPath }) })
    expect(registry.flows.map((flow) => flow.id)).toEqual(['publication', 'pokedex', 'forecast'])

    const descriptor = describeFlow(registry.flows[0])
    if (descriptor instanceof Error) throw descriptor
    expect(descriptor.nodes.map((node) => node.id)).toEqual(publicationFixture.nodeIds)
    expect(descriptor.startIds).toEqual([publicationFixture.startId])
  })
})
