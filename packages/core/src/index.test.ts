import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import * as jobik from './index.js'

describe('@jobik/core namespace surface', () => {
  it('exposes the builders at the top level', () => {
    expect(typeof jobik.start).toBe('function')
    expect(typeof jobik.node).toBe('function')
    expect(typeof jobik.flow).toBe('function')
    expect(typeof jobik.asset).toBe('function')
    expect(typeof jobik.assetMetaOf).toBe('function')
  })

  it('still exposes the error taxonomy', () => {
    expect(typeof jobik.FlowSchemaError).toBe('function')
    expect(jobik.jobikErrorTags).toHaveLength(13)
  })

  it('has no default export and no nested jobik object', () => {
    expect('default' in jobik).toBe(false)
    expect('jobik' in jobik).toBe(false)
  })

  it('builds the spec example end to end through the namespace', () => {
    const publicationInput = jobik.start({
      title: 'Publication input',
      input: z.object({ title: z.string(), markdown: z.string() }),
    })

    const render = jobik.node({
      title: 'Render image',
      input: z.object({ markdown: z.string() }),
      output: z.object({ image: jobik.asset({ mime: 'image/png' }), caption: z.string() }),
      run: async ({ markdown }) => ({ image: Buffer.from(markdown), caption: markdown }),
    })

    const jsonFile = path.resolve('flow.jobik.json')

    const publication = jobik
      .flow('publication')
      .start('start1', publicationInput)
      .node('render', render)
      .bind('path', jsonFile)

    expect(publication.name).toBe('publication')
    expect(publication.path).toBe(jsonFile)
    expect(Object.keys(publication.nodes)).toEqual(['start1', 'render'])
    expect(publication.nodes.render.kind).toBe('transform')
    expect(jobik.assetMetaOf(publication.nodes.render.output.shape.image)?.mime).toBe('image/png')
  })
})
