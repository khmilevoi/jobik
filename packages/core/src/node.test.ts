import { describe, expect, expectTypeOf, it } from 'vitest'
import * as z from 'zod'
import { type AnyNodeDefinition, type AnyStartDefinition, node, start } from './node.js'

describe('start()', () => {
  it('produces a start definition with no handler and no id', () => {
    const definition = start({
      title: 'Publication input',
      input: z.object({ title: z.string(), markdown: z.string() }),
    })
    expect(definition.kind).toBe('start')
    expect(definition.title).toBe('Publication input')
    expect(Object.keys(definition).sort()).toEqual(['input', 'kind', 'title'])
    expect('id' in definition).toBe(false)
    expect('run' in definition).toBe(false)
  })

  it('keeps the schema it was handed, by identity', () => {
    const input = z.object({ title: z.string() })
    expect(start({ title: 'Input', input }).input).toBe(input)
  })

  it('satisfies the loose start bound', () => {
    const definition: AnyStartDefinition = start({
      title: 'Input',
      input: z.object({ title: z.string() }),
    })
    expect(definition.kind).toBe('start')
  })
})

describe('node()', () => {
  const render = node({
    title: 'Render image',
    input: z.object({ markdown: z.string() }),
    output: z.object({ imageUrl: z.url() }),
    run: async ({ markdown }) => ({ imageUrl: `https://cdn.test/${markdown}` }),
  })

  it('defaults kind to transform and carries no id', () => {
    expect(render.kind).toBe('transform')
    expect(Object.keys(render).sort()).toEqual(['input', 'kind', 'output', 'run', 'title'])
    expect('id' in render).toBe(false)
  })

  it('honours an explicit sink kind', () => {
    const publish = node({
      kind: 'sink',
      title: 'Publish',
      input: z.object({ imageUrl: z.string() }),
      output: z.object({}),
      run: () => ({}),
    })
    expect(publish.kind).toBe('sink')
  })

  it('passes validated input and a run context to the handler', async () => {
    const controller = new AbortController()
    const seen: unknown[] = []
    const definition = node({
      title: 'Echo',
      input: z.object({ n: z.number() }),
      output: z.object({ n: z.number() }),
      run: (input, context) => {
        seen.push(input, context.signal)
        return { n: input.n + 1 }
      },
    })
    const result = await definition.run({ n: 1 }, { signal: controller.signal })
    expect(result).toEqual({ n: 2 })
    expect(seen).toEqual([{ n: 1 }, controller.signal])
  })

  it('lets a handler return an expected error as a value', async () => {
    const definition = node({
      title: 'Fails',
      input: z.object({}),
      output: z.object({ n: z.number() }),
      run: () => new Error('upstream service is down'),
    })
    const result = await definition.run({}, { signal: new AbortController().signal })
    expect(result).toBeInstanceOf(Error)
  })

  it('satisfies the loose node bound', () => {
    const definition: AnyNodeDefinition = render
    expect(definition.title).toBe('Render image')
  })

  it('types the handler argument from the input schema', () => {
    node({
      title: 'Typed',
      input: z.object({ markdown: z.string() }),
      output: z.object({ length: z.number() }),
      run: (input) => {
        expectTypeOf(input).toEqualTypeOf<{ markdown: string }>()
        return { length: input.markdown.length }
      },
    })
    expect(true).toBe(true)
  })

  it('rejects an output the schema does not describe', () => {
    node({
      title: 'Wrong output',
      input: z.object({}),
      output: z.object({ n: z.number() }),
      // @ts-expect-error the handler must return the declared output shape
      run: () => ({ wrong: true }),
    })
    expect(true).toBe(true)
  })
})
