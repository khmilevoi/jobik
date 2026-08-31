import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import * as jobik from '#index.js'

describe('@jobik/core namespace — editor schema surface', () => {
  it('exposes the two derive functions and the callback factory', () => {
    expect(typeof jobik.deriveInputControls).toBe('function')
    expect(typeof jobik.deriveOutputFields).toBe('function')
    expect(typeof jobik.createAssetUnrepresentableHandler).toBe('function')
    expect(typeof jobik.assetJsonSchema).toBe('function')
    expect(jobik.assetExtensionKey).toBe('x-jobik-asset')
  })
})

describe('descriptors are browser-safe', () => {
  const render = jobik.node({
    title: 'Render image',
    input: z.object({ markdown: z.string(), width: z.number().int().default(1024) }),
    output: z.object({ image: jobik.asset({ mime: 'image/png' }), caption: z.string() }),
    run: async ({ markdown }) => ({ image: Buffer.from(markdown), caption: markdown }),
  })

  it('survives a JSON round trip unchanged, on both sides', () => {
    const input = jobik.deriveInputControls({ nodeId: 'render', input: render.input })
    const output = jobik.deriveOutputFields({ nodeId: 'render', output: render.output })
    if (input instanceof Error) throw input
    if (output instanceof Error) throw output

    expect(JSON.parse(JSON.stringify(input))).toStrictEqual(input)
    expect(JSON.parse(JSON.stringify(output))).toStrictEqual(output)
  })

  it('derives the design render node exactly', () => {
    expect(jobik.deriveInputControls({ nodeId: 'render', input: render.input })).toStrictEqual({
      nodeId: 'render',
      fields: [
        { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
        {
          field: 'width',
          required: false,
          annotation: 'number',
          default: 1024,
          control: {
            kind: 'number',
            integer: true,
            minimum: -9007199254740991,
            maximum: 9007199254740991,
          },
        },
      ],
    })

    expect(jobik.deriveOutputFields({ nodeId: 'render', output: render.output })).toStrictEqual({
      nodeId: 'render',
      fields: [
        {
          field: 'image',
          required: true,
          annotation: 'Buffer',
          title: 'Buffer',
          asset: { mime: 'image/png' },
        },
        { field: 'caption', required: true, annotation: 'string' },
      ],
    })
  })

  it('derives one control per start input field, as the run panel needs', () => {
    const publicationInput = jobik.start({
      title: 'Publication input',
      input: z.object({ title: z.string(), markdown: z.string() }),
    })

    const descriptor = jobik.deriveInputControls({
      nodeId: 'start1',
      input: publicationInput.input,
    })
    if (descriptor instanceof Error) throw descriptor

    expect(descriptor.fields.map((field) => [field.field, field.annotation])).toStrictEqual([
      ['title', 'string'],
      ['markdown', 'string'],
    ])
  })
})
