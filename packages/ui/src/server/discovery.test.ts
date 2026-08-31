import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/showcase/publication/fixtures.js'
import { defineJobikConfig } from './config.js'
import { discoverFlows, loadJobikConfig } from './discovery.js'
import { uiPath } from './testSupport.js'

const fixtures = path.resolve(import.meta.dirname, 'fixtures')

const publicationConfig = defineJobikConfig({
  server: { host: '127.0.0.1', port: 0 },
  flows: [{ binding: publicationFixture.bindingPath, ui: uiPath }],
})

describe('loadJobikConfig', () => {
  it('loads a TypeScript config module through its default export', async () => {
    const config = await loadJobikConfig({ path: path.resolve(fixtures, 'validConfig.ts') })
    expect(config.server).toEqual({ host: '127.0.0.1', port: 0 })
    expect(config.flows).toEqual([{ binding: publicationFixture.bindingPath, ui: uiPath }])
  })

  it('rejects a module whose default export is not a configuration', async () => {
    await expect(
      loadJobikConfig({ path: path.resolve(fixtures, 'notAConfig.ts') }),
    ).rejects.toThrow(/expected a configuration object/)
  })

  it('rejects a module that does not exist', async () => {
    await expect(
      loadJobikConfig({ path: path.resolve(fixtures, 'missingConfig.ts') }),
    ).rejects.toThrow()
  })
})

describe('discoverFlows', () => {
  it('discovers only the configured entrypoint pairs, in config order', async () => {
    const registry = await discoverFlows({ config: publicationConfig })
    expect(registry.flows).toHaveLength(1)
    expect(registry.flows.map((entry) => entry.id)).toEqual([publicationFixture.flowName])
  })

  it('carries the bound flow, its document path and both configured paths', async () => {
    const registry = await discoverFlows({ config: publicationConfig })
    const discovered = registry.flows[0]
    expect(discovered.flow.name).toBe(publicationFixture.flowName)
    expect(Object.keys(discovered.flow.nodes)).toEqual(publicationFixture.nodeIds)
    expect(discovered.bindingPath).toBe(publicationFixture.bindingPath)
    expect(discovered.documentPath).toBe(publicationFixture.documentPath)
    expect(discovered.uiPath).toBe(uiPath)
  })

  it('does not require the ui entrypoint to exist — bundling it is not this layer', async () => {
    const config = defineJobikConfig({
      flows: [
        {
          binding: publicationFixture.bindingPath,
          ui: path.resolve(publicationFixture.root, 'no-such-file.tsx'),
        },
      ],
    })
    const registry = await discoverFlows({ config })
    expect(registry.flows[0].uiPath).toBe(path.resolve(publicationFixture.root, 'no-such-file.tsx'))
  })

  it('looks a flow up by id and reports an unknown id as undefined', async () => {
    const registry = await discoverFlows({ config: publicationConfig })
    expect(registry.get(publicationFixture.flowName)?.documentPath).toBe(
      publicationFixture.documentPath,
    )
    expect(registry.get('no-such-flow')).toBeUndefined()
  })

  it('rejects a binding module whose default export is not a bound flow', async () => {
    const config = defineJobikConfig({
      flows: [{ binding: path.resolve(fixtures, 'notAFlow.ts'), ui: uiPath }],
    })
    await expect(discoverFlows({ config })).rejects.toThrow(/must default-export a bound flow/)
  })

  it('rejects a binding module that does not exist', async () => {
    const config = defineJobikConfig({
      flows: [{ binding: path.resolve(fixtures, 'missingBinding.ts'), ui: uiPath }],
    })
    await expect(discoverFlows({ config })).rejects.toThrow()
  })
})
