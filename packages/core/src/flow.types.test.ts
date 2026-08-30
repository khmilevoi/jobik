import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { asset } from './asset.js'
import type {
  InputFieldOf,
  NodeIdOf,
  NodeOutputOf,
  OutputFieldOf,
  StartIdOf,
  StartInputOf,
} from './flow.js'
import { flow } from './flow.js'
import { node, start } from './node.js'

const publicationInput = start({
  title: 'Publication input',
  input: z.object({ title: z.string(), markdown: z.string() }),
})

const render = node({
  title: 'Render image',
  input: z.object({ markdown: z.string() }),
  output: z.object({ image: asset({ mime: 'image/png' }), caption: z.string() }),
  run: async ({ markdown }, context) => {
    context.signal.throwIfAborted()
    return { image: Buffer.from(markdown), caption: markdown }
  },
})

const publish = node({
  kind: 'sink',
  title: 'Publish',
  input: z.object({ caption: z.string() }),
  output: z.object({}),
  run: () => ({}),
})

const publication = flow('publication')
  .start('start1', publicationInput)
  .node('render', render)
  .node('publish', publish)
  .bind('path', path.resolve('flow.jobik.json'))

type Nodes = (typeof publication)['nodes']

describe('flow types', () => {
  it('types node ids, start ids, field names and payloads at the call site', () => {
    const id: NodeIdOf<Nodes> = 'render'
    // @ts-expect-error 'nope' is not a node of this flow
    const unknownId: NodeIdOf<Nodes> = 'nope'

    const startId: StartIdOf<Nodes> = 'start1'
    // @ts-expect-error 'render' is a node, not a start
    const notAStart: StartIdOf<Nodes> = 'render'

    const outputField: OutputFieldOf<Nodes, 'render'> = 'image'
    // @ts-expect-error 'markdown' is an input field of render, not an output field
    const notAnOutputField: OutputFieldOf<Nodes, 'render'> = 'markdown'

    const startOutputField: OutputFieldOf<Nodes, 'start1'> = 'markdown'
    const inputField: InputFieldOf<Nodes, 'render'> = 'markdown'

    const payload: StartInputOf<Nodes, 'start1'> = { title: 't', markdown: 'm' }
    // @ts-expect-error markdown is required
    const shortPayload: StartInputOf<Nodes, 'start1'> = { title: 't' }

    const renderOutput: NodeOutputOf<Nodes, 'render'> = {
      image: Buffer.from('png'),
      caption: 'c',
    }
    const startOutput: NodeOutputOf<Nodes, 'start1'> = { title: 't', markdown: 'm' }

    expect([
      id,
      unknownId,
      startId,
      notAStart,
      outputField,
      notAnOutputField,
      startOutputField,
      inputField,
      payload,
      shortPayload,
      renderOutput,
      startOutput,
    ]).toHaveLength(12)
  })

  it('exposes the runtime record the derived types describe', () => {
    expect(Object.keys(publication.nodes)).toEqual(['start1', 'render', 'publish'])
    expect(publication.nodes.publish.kind).toBe('sink')
  })
})
