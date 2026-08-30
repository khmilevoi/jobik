import { describe, expect, it, vi } from 'vitest'
import { defineFlowUi } from '../output/index.js'
import {
  BUNDLE_EXTERNALS,
  FlowUiLoadError,
  findBareSpecifiers,
  loadFlowUi,
  rewriteBareSpecifiers,
  shimSourceFor,
} from './extensionLoader.js'

const BUNDLE = [
  `import { jsx } from "react/jsx-runtime";`,
  `import { defineFlowUi } from '@jobik/ui'`,
  `import "./local.css"`,
  `const RenderedImage = () => jsx("div", {});`,
  `export default defineFlowUi({ nodes: { render: { Output: RenderedImage } } });`,
].join('\n')

describe('BUNDLE_EXTERNALS', () => {
  it('names every specifier the server marks external, plus the JSX runtimes', () => {
    expect([...BUNDLE_EXTERNALS]).toEqual([
      '@jobik/core',
      '@jobik/ui',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
    ])
  })
})

describe('findBareSpecifiers', () => {
  it('finds static imports in either quote style and ignores relative ones', () => {
    expect(findBareSpecifiers(BUNDLE)).toEqual(['react/jsx-runtime', '@jobik/ui'])
  })

  it('finds a dynamic import', () => {
    expect(findBareSpecifiers(`const m = await import("@jobik/core")`)).toEqual(['@jobik/core'])
  })

  it('finds a re-export', () => {
    expect(findBareSpecifiers(`export { x } from 'react'`)).toEqual(['react'])
  })
})

describe('findBareSpecifiers ignores comments and unrelated string literals', () => {
  it('ignores a specifier-shaped mention inside a // line comment', () => {
    expect(findBareSpecifiers('// import "react" is external')).toEqual([])
  })

  it('ignores a specifier-shaped mention nested in a string literal, quotes and all', () => {
    expect(findBareSpecifiers(`const msg = "please import 'lodash' manually"`)).toEqual([])
  })

  it('ignores a specifier-shaped mention inside a /* */ block comment', () => {
    expect(findBareSpecifiers('/* import "react" is external */')).toEqual([])
  })

  it('ignores a specifier-shaped mention inside a template literal', () => {
    expect(findBareSpecifiers('const msg = `please import "lodash" manually`')).toEqual([])
  })

  it('still finds a genuine import on the line after a comment mentioning a specifier', () => {
    const source = ['// see also "react" for context', `import { x } from 'react'`].join('\n')
    expect(findBareSpecifiers(source)).toEqual(['react'])
  })
})

describe('rewriteBareSpecifiers', () => {
  it('replaces each bare specifier with its resolved URL and leaves relative ones alone', () => {
    const rewritten = rewriteBareSpecifiers(BUNDLE, (specifier) => `blob:${specifier}`)

    expect(rewritten).not.toBeInstanceOf(Error)
    if (rewritten instanceof Error) return
    expect(rewritten).toContain('from "blob:react/jsx-runtime"')
    expect(rewritten).toContain(`from 'blob:@jobik/ui'`)
    expect(rewritten).toContain('import "./local.css"')
  })

  it('returns a FlowUiLoadError naming a specifier nothing resolves', () => {
    const rewritten = rewriteBareSpecifiers(BUNDLE, (specifier) =>
      specifier === '@jobik/ui' ? 'blob:ui' : undefined,
    )

    expect(rewritten).toBeInstanceOf(FlowUiLoadError)
    if (!(rewritten instanceof FlowUiLoadError)) return
    expect(rewritten.specifier).toBe('react/jsx-runtime')
  })
})

describe('rewriteBareSpecifiers ignores comments and unrelated string literals', () => {
  it('leaves a line comment untouched: a registered mention does not get rewritten', () => {
    const source = '// import "react" is external'
    const rewritten = rewriteBareSpecifiers(source, (specifier) =>
      specifier === 'react' ? 'blob:react' : undefined,
    )
    expect(rewritten).toBe(source)
  })

  it('leaves a string literal untouched, nested quotes and all', () => {
    const source = `const msg = "please import 'lodash' manually"`
    const rewritten = rewriteBareSpecifiers(source, (specifier) =>
      specifier === 'lodash' ? 'blob:lodash' : undefined,
    )
    expect(rewritten).toBe(source)
  })

  it('leaves a block comment untouched, whether it names a registered or an unregistered specifier', () => {
    const source = '/* import "react" is external, and so is "left-pad" */'
    const rewritten = rewriteBareSpecifiers(source, (specifier) =>
      specifier === 'react' ? 'blob:react' : undefined,
    )
    expect(rewritten).toBe(source)
  })

  it('leaves a template literal untouched, whether it names a registered or an unregistered specifier', () => {
    const source = 'const msg = `please import "react" or "left-pad" manually`'
    const rewritten = rewriteBareSpecifiers(source, (specifier) =>
      specifier === 'react' ? 'blob:react' : undefined,
    )
    expect(rewritten).toBe(source)
  })

  it('still rewrites a genuine import on the line after a comment mentioning a specifier', () => {
    const source = ['// see also "react" for context', `import { x } from 'react'`].join('\n')
    const rewritten = rewriteBareSpecifiers(source, (specifier) =>
      specifier === 'react' ? 'blob:react' : undefined,
    )
    expect(rewritten).toBe(
      ['// see also "react" for context', `import { x } from 'blob:react'`].join('\n'),
    )
  })
})

describe('shimSourceFor', () => {
  it('re-exports the namespace keys off the global registry, plus a default', () => {
    const source = shimSourceFor('react', { jsx: () => null })

    expect(source).toContain(`globalThis.__JOBIK_EXTERNALS__["react"]`)
    expect(source).toContain('export const jsx = ns["jsx"];')
    expect(source).toContain('export default')
  })

  it('re-exports only valid identifier keys, skipping the namespace default key itself', () => {
    const source = shimSourceFor('@jobik/ui', {
      defineFlowUi: () => {},
      'not-an-identifier': 1,
      default: 'ignored-as-a-named-export',
    })

    expect(source).toContain('export const defineFlowUi = ns["defineFlowUi"];')
    expect(source).not.toContain('not-an-identifier')
    expect(source).not.toContain('export const default')
  })
})

describe('loadFlowUi', () => {
  const externals = { '@jobik/ui': { defineFlowUi }, 'react/jsx-runtime': { jsx: () => null } }

  it('returns the descriptor the bundle default-exports', async () => {
    const descriptor = defineFlowUi({ nodes: { render: { Output: () => null } } })
    const importModule = vi.fn(async () => ({ default: descriptor }))

    const loaded = await loadFlowUi({
      fetchBundle: async () => BUNDLE,
      externals,
      importModule,
    })

    expect(loaded).toBe(descriptor)
    expect(importModule).toHaveBeenCalledTimes(1)
  })

  it('returns a FlowUiLoadError when the bundle cannot be fetched', async () => {
    const loaded = await loadFlowUi({
      fetchBundle: async () => {
        throw new Error('500')
      },
      externals,
      importModule: async () => ({}),
    })

    expect(loaded).toBeInstanceOf(FlowUiLoadError)
  })

  it('returns a FlowUiLoadError naming the specifier no external provides', async () => {
    const loaded = await loadFlowUi({
      fetchBundle: async () => `import "react-dom/client"`,
      externals: {},
      importModule: async () => ({}),
    })

    expect(loaded).toBeInstanceOf(FlowUiLoadError)
    if (!(loaded instanceof FlowUiLoadError)) return
    expect(loaded.specifier).toBe('react-dom/client')
  })

  it('returns a FlowUiLoadError when the default export is not a flow UI descriptor', async () => {
    const loaded = await loadFlowUi({
      fetchBundle: async () => BUNDLE,
      externals,
      importModule: async () => ({ default: { nodes: 'not an object map' } }),
    })

    expect(loaded).toBeInstanceOf(FlowUiLoadError)
  })

  it('returns a FlowUiLoadError when evaluating the module throws', async () => {
    const loaded = await loadFlowUi({
      fetchBundle: async () => BUNDLE,
      externals,
      importModule: async () => {
        throw new SyntaxError('Unexpected token')
      },
    })

    expect(loaded).toBeInstanceOf(FlowUiLoadError)
  })
})
