import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { flow } from './flow.js'
import { node, start } from './node.js'

const publicationInput = start({
  title: 'Publication input',
  input: z.object({ title: z.string(), markdown: z.string() }),
})

const render = node({
  title: 'Render image',
  input: z.object({ markdown: z.string() }),
  output: z.object({ imageUrl: z.url() }),
  run: async ({ markdown }) => ({ imageUrl: `https://cdn.test/${markdown}` }),
})

const jsonFile = path.resolve('flow.jobik.json')

describe('flow()', () => {
  it('binds a name, an absolute path and the attached definitions', () => {
    const publication = flow('publication')
      .start('start1', publicationInput)
      .node('render', render)
      .bind('path', jsonFile)

    expect(publication.name).toBe('publication')
    expect(publication.path).toBe(jsonFile)
    expect(publication.nodes.start1).toBe(publicationInput)
    expect(publication.nodes.render).toBe(render)
  })

  it('assigns the only id a definition has, without touching the definition', () => {
    const bound = flow('publication').node('render', render).bind('path', jsonFile)
    expect(Object.keys(bound.nodes)).toEqual(['render'])
    expect('id' in bound.nodes.render).toBe(false)
  })

  it('attaches one definition under two ids in one flow', () => {
    const bound = flow('publication')
      .node('renderA', render)
      .node('renderB', render)
      .bind('path', jsonFile)
    expect(Object.keys(bound.nodes)).toEqual(['renderA', 'renderB'])
    expect(bound.nodes.renderA).toBe(bound.nodes.renderB)
  })

  it('keeps declaration order', () => {
    const bound = flow('publication')
      .start('start1', publicationInput)
      .node('render', render)
      .node('publish', render)
      .bind('path', jsonFile)
    expect(Object.keys(bound.nodes)).toEqual(['start1', 'render', 'publish'])
  })

  it('accepts any number of starts', () => {
    const bound = flow('publication')
      .start('start1', publicationInput)
      .start('start2', publicationInput)
      .bind('path', jsonFile)
    expect(Object.keys(bound.nodes)).toEqual(['start1', 'start2'])
  })

  it('is immutable, so an intermediate builder can be branched', () => {
    const base = flow('publication').start('start1', publicationInput)
    const a = base.node('render', render).bind('path', jsonFile)
    const b = base.node('other', render).bind('path', jsonFile)
    expect(Object.keys(a.nodes)).toEqual(['start1', 'render'])
    expect(Object.keys(b.nodes)).toEqual(['start1', 'other'])
  })

  it('rejects a duplicate node id', () => {
    expect(() =>
      flow('publication')
        .node('render', render)
        // @ts-expect-error the compiler rejects the duplicate id too
        .node('render', render),
    ).toThrow(new TypeError("jobik.flow('publication'): node id 'render' is already used"))
  })

  it('rejects a duplicate id across start and node', () => {
    expect(() =>
      flow('publication')
        .start('start1', publicationInput)
        // @ts-expect-error the compiler rejects the duplicate id too
        .node('start1', render),
    ).toThrow(TypeError)
  })
})

describe("bind('path', …)", () => {
  it('rejects a relative path', () => {
    expect(() => flow('publication').bind('path', './flow.jobik.json')).toThrow(
      new TypeError(
        "jobik.flow('publication'): bind('path', ...) requires an absolute path, received './flow.jobik.json'",
      ),
    )
  })

  it('rejects a bare filename', () => {
    expect(() => flow('publication').bind('path', 'flow.jobik.json')).toThrow(TypeError)
  })

  it('rejects an empty path', () => {
    expect(() => flow('publication').bind('path', '')).toThrow(TypeError)
  })

  it('accepts an absolute path', () => {
    expect(flow('publication').bind('path', jsonFile).path).toBe(jsonFile)
  })

  it('does not return an Error value', () => {
    expect(flow('publication').bind('path', jsonFile)).not.toBeInstanceOf(Error)
  })
})
