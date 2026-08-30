import * as fs from 'node:fs/promises'
import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { defineJobikConfig } from './config.js'
import { discoverFlows } from './discovery.js'
import { listFlows, loadFlow, saveFlow, validateDraft } from './flowService.js'
import { committedFlow, setupCleanups, temporaryFlow, uiPath } from './testSupport.js'

setupCleanups()

describe('listFlows', () => {
  it('summarises every discovered flow', async () => {
    const registry = await discoverFlows({
      config: defineJobikConfig({
        flows: [{ binding: publicationFixture.bindingPath, ui: uiPath }],
      }),
    })
    expect(listFlows(registry)).toEqual([{ id: 'publication', name: 'publication', nodeCount: 3 }])
  })
})

describe('loadFlow', () => {
  it('returns the descriptor, the document and the revision of the bytes on disk', async () => {
    const loaded = await loadFlow(await committedFlow())
    if (loaded instanceof Error) throw loaded
    expect(loaded.descriptor.nodes.map((node) => node.id)).toEqual(['start1', 'render', 'publish'])
    expect(loaded.document.format).toBe('jobik.flow')
    expect(loaded.document.version).toBe(1)
    expect(loaded.document.connections).toHaveLength(4)
    expect(loaded.revision).toBe(
      jobik.revisionOf(await fs.readFile(publicationFixture.documentPath)),
    )
  })

  it('returns FlowFileReadError as a value when the document is gone', async () => {
    const flow = await temporaryFlow()
    await fs.rm(flow.documentPath)
    const loaded = await loadFlow(flow)
    expect(loaded).toBeInstanceOf(jobik.FlowFileReadError)
  })

  it('returns FlowSchemaError as a value when the document is not JSON', async () => {
    const flow = await temporaryFlow()
    await fs.writeFile(flow.documentPath, 'not json at all', 'utf8')
    expect(await loadFlow(flow)).toBeInstanceOf(jobik.FlowSchemaError)
  })
})

describe('validateDraft', () => {
  it('accepts the example document', async () => {
    const flow = await committedFlow()
    const loaded = await loadFlow(flow)
    if (loaded instanceof Error) throw loaded
    const result = validateDraft({ flow, draft: loaded.document })
    expect(result.valid).toBe(true)
  })

  it('rejects a draft that is not a jobik.flow document', async () => {
    const result = validateDraft({ flow: await committedFlow(), draft: { format: 'nope' } })
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.error).toBeInstanceOf(jobik.FlowSchemaError)
  })

  it('rejects a connection to a node that does not exist — P5 decides, not this layer', async () => {
    const result = validateDraft({
      flow: await committedFlow(),
      draft: {
        format: 'jobik.flow',
        version: 1,
        connections: [
          { from: { node: 'start1', field: 'title' }, to: { node: 'ghost', field: 'x' } },
        ],
        literals: {},
        layout: {},
      },
    })
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.error).toBeInstanceOf(jobik.ConnectionError)
  })
})

describe('saveFlow', () => {
  it('writes the canonical document and returns the new revision', async () => {
    const flow = await temporaryFlow()
    const loaded = await loadFlow(flow)
    if (loaded instanceof Error) throw loaded

    const draft: jobik.FlowDocument = {
      ...loaded.document,
      layout: { ...loaded.document.layout, render: { x: 400, y: 160 } },
    }
    const saved = await saveFlow({ flow, draft, expectedRevision: loaded.revision })
    if (saved instanceof Error) throw saved

    const text = await fs.readFile(flow.documentPath, 'utf8')
    expect(JSON.parse(text)).toEqual(draft)
    // Canonical form, asserted without depending on the key order the parser hands back.
    expect(text).toBe(jobik.serializeFlowDocument(JSON.parse(text) as jobik.FlowDocument))
    expect(text.endsWith('\n')).toBe(true)
    expect(saved.revision).toBe(jobik.revisionOf(text))
    expect(saved.revision).not.toBe(loaded.revision)
  })

  it('returns FlowRevisionConflictError when the file changed under the draft', async () => {
    const flow = await temporaryFlow()
    const loaded = await loadFlow(flow)
    if (loaded instanceof Error) throw loaded

    await fs.appendFile(flow.documentPath, '\n', 'utf8')
    const saved = await saveFlow({
      flow,
      draft: loaded.document,
      expectedRevision: loaded.revision,
    })
    expect(saved).toBeInstanceOf(jobik.FlowRevisionConflictError)
  })

  it('refuses to save a draft that does not validate, and leaves the file untouched', async () => {
    const flow = await temporaryFlow()
    const before = await fs.readFile(flow.documentPath, 'utf8')
    const saved = await saveFlow({
      flow,
      draft: {
        format: 'jobik.flow',
        version: 1,
        connections: [
          { from: { node: 'start1', field: 'title' }, to: { node: 'ghost', field: 'x' } },
        ],
        literals: {},
        layout: {},
      },
      expectedRevision: 'whatever',
    })
    expect(saved).toBeInstanceOf(jobik.ConnectionError)
    expect(await fs.readFile(flow.documentPath, 'utf8')).toBe(before)
  })

  it('returns the read failure as a value when the document vanished before the save', async () => {
    const flow = await temporaryFlow()
    const loaded = await loadFlow(flow)
    if (loaded instanceof Error) throw loaded
    await fs.rm(flow.documentPath)
    const saved = await saveFlow({
      flow,
      draft: loaded.document,
      expectedRevision: loaded.revision,
    })
    // The revision re-read is the boundary that fails first, and it fails as a value.
    expect(saved).toBeInstanceOf(jobik.FlowFileReadError)
  })
})
