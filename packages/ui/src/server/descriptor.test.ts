import path from 'node:path'
import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { defineJobikConfig } from './config.js'
import { describeFlow, summariseFlow } from './descriptor.js'
import { type DiscoveredFlow, discoverFlows } from './discovery.js'
import { findUnsafeValues } from './wireSafety.js'

async function discoverPublication(): Promise<DiscoveredFlow> {
  const config = defineJobikConfig({
    flows: [
      {
        binding: publicationFixture.bindingPath,
        ui: path.resolve(publicationFixture.root, 'flow.ui.tsx'),
      },
    ],
  })
  const registry = await discoverFlows({ config })
  return registry.flows[0]
}

describe('summariseFlow', () => {
  it('produces the sidebar row: id, name and node count', async () => {
    expect(summariseFlow(await discoverPublication())).toEqual({
      id: 'publication',
      name: 'publication',
      nodeCount: 3,
    })
  })
})

describe('describeFlow', () => {
  it('carries every node id, kind and title in builder order', async () => {
    const descriptor = describeFlow(await discoverPublication())
    if (descriptor instanceof Error) throw descriptor
    expect(descriptor.nodes.map((node) => [node.id, node.kind, node.title])).toEqual([
      ['start1', 'start', 'Publication input'],
      ['render', 'transform', 'Render image'],
      ['publish', 'sink', 'Publish image'],
    ])
  })

  it('lists the flow id, name and the document file name only', async () => {
    const descriptor = describeFlow(await discoverPublication())
    if (descriptor instanceof Error) throw descriptor
    expect(descriptor.id).toBe('publication')
    expect(descriptor.name).toBe('publication')
    expect(descriptor.documentFile).toBe('flow.jobik.json')
  })

  it('lists the starts', async () => {
    const descriptor = describeFlow(await discoverPublication())
    if (descriptor instanceof Error) throw descriptor
    expect(descriptor.startIds).toEqual(['start1'])
  })

  it('carries P6 control descriptors and type annotations for a normal node', async () => {
    const descriptor = describeFlow(await discoverPublication())
    if (descriptor instanceof Error) throw descriptor
    const render = descriptor.nodes.find((node) => node.id === 'render')
    expect(render?.input.fields.map((field) => [field.field, field.control.kind])).toEqual([
      ['title', 'string'],
      ['markdown', 'string'],
    ])
    expect(render?.output.fields.map((field) => [field.field, field.annotation])).toEqual([
      ['image', 'Buffer'],
      ['caption', 'string'],
    ])
    expect(render?.output.fields[0].asset).toEqual({ mime: 'image/png' })
  })

  it("uses a start's input schema for its output fields", async () => {
    const descriptor = describeFlow(await discoverPublication())
    if (descriptor instanceof Error) throw descriptor
    const start = descriptor.nodes.find((node) => node.id === 'start1')
    expect(start?.input.fields.map((field) => field.field)).toEqual(['title', 'markdown'])
    expect(start?.output.fields.map((field) => field.field)).toEqual(['title', 'markdown'])
  })

  it('is pure JSON: a round trip changes nothing', async () => {
    const descriptor = describeFlow(await discoverPublication())
    if (descriptor instanceof Error) throw descriptor
    expect(JSON.parse(JSON.stringify(descriptor))).toStrictEqual(descriptor)
  })

  it('carries no handler, no absolute path and no forbidden key', async () => {
    const discovered = await discoverPublication()
    const descriptor = describeFlow(discovered)
    if (descriptor instanceof Error) throw descriptor
    expect(
      findUnsafeValues(JSON.parse(JSON.stringify(descriptor)), [
        publicationFixture.root,
        discovered.documentPath,
        discovered.bindingPath,
        discovered.uiPath,
      ]),
    ).toEqual([])
  })

  it('returns JobUiSchemaError as a value when a schema cannot be represented', () => {
    const unrepresentable = jobik
      .flow('broken')
      .start('start1', jobik.start({ title: 'Start', input: z.object({ when: z.date() }) }))
      .bind('path', path.resolve(publicationFixture.root, 'flow.jobik.json'))
    const discovered: DiscoveredFlow = {
      id: unrepresentable.name,
      flow: unrepresentable,
      bindingPath: publicationFixture.bindingPath,
      uiPath: path.resolve(publicationFixture.root, 'flow.ui.tsx'),
      documentPath: unrepresentable.path,
    }
    const result = describeFlow(discovered)
    expect(result).toBeInstanceOf(jobik.JobUiSchemaError)
    expect((result as jobik.JobUiSchemaError)._tag).toBe('JobUiSchemaError')
  })
})
