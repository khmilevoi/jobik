import { describe, expect, it } from 'vitest'
import {
  cssModuleClassNames,
  cssModuleImports,
  cssModuleReads,
  findCssModuleViolations,
  stripComments,
  stripStrings,
} from './cssModuleSource.js'

describe('cssModuleClassNames', () => {
  it('reads the class names out of the selector preludes', () => {
    expect(cssModuleClassNames('.chip { color: red }\n.chipAccent { color: blue }')).toEqual([
      'chip',
      'chipAccent',
    ])
  })

  it('reads a class out of a nested at-rule but never the at-rule itself', () => {
    expect(cssModuleClassNames('@media (min-width: 900px) { .wide { gap: 4px } }')).toEqual([
      'wide',
    ])
  })

  it('does not mistake a decimal in a declaration for a class name', () => {
    expect(cssModuleClassNames('.box { opacity: 0.42; padding: 1.5px }')).toEqual(['box'])
  })

  it('reads every class of a compound selector and lists each once', () => {
    expect(cssModuleClassNames('.chip.accent > .label, .chip { color: red }')).toEqual([
      'chip',
      'accent',
      'label',
    ])
  })

  it('ignores commented-out rules', () => {
    expect(cssModuleClassNames('/* .dead { color: red } */\n.live { color: blue }')).toEqual([
      'live',
    ])
  })
})

describe('stripComments', () => {
  it('drops both comment forms', () => {
    expect(stripComments('a /* x */ b // y\nc').trim()).toBe('a  b \nc')
  })

  it('leaves a // inside a string alone', () => {
    expect(stripComments("const u = 'https://x' // gone")).toContain("'https://x'")
  })
})

describe('stripStrings', () => {
  // biome-ignore-start lint/suspicious/noTemplateCurlyInString: the forbidden pattern, as text
  it('collapses a string to its own empty form, keeping the quote kind', () => {
    expect(stripStrings("s['chip']")).toBe("s['']")
    expect(stripStrings('s[`chip-${tone}`]')).toBe('s[``]')
  })
  // biome-ignore-end lint/suspicious/noTemplateCurlyInString: the forbidden pattern, as text
})

describe('cssModuleImports', () => {
  it('finds the binding and specifier', () => {
    expect(cssModuleImports("import s from './Button.module.css'")).toEqual([
      { binding: 's', specifier: './Button.module.css' },
    ])
  })

  it('ignores a plain stylesheet import and a commented-out one', () => {
    expect(cssModuleImports("import './tokens.css'")).toEqual([])
    expect(cssModuleImports("// import s from './Dead.module.css'")).toEqual([])
  })
})

describe('cssModuleReads', () => {
  it('reads literal property and bracket access', () => {
    expect(cssModuleReads("cx(s.chip, s['accent'])", 's')).toEqual({
      classes: ['chip', 'accent'],
      computed: [],
    })
  })

  it('does not mistake another object`s property for a stylesheet read', () => {
    expect(cssModuleReads('props.s.chip', 's').classes).toEqual([])
  })

  it('ignores a class named only inside a comment or a string', () => {
    expect(cssModuleReads("/* s.ghost */ const label = 's.other'", 's').classes).toEqual([])
  })

  // biome-ignore-start lint/suspicious/noTemplateCurlyInString: the forbidden pattern, as text
  it('reports a computed key instead of silently reading nothing', () => {
    expect(cssModuleReads('s[variant]', 's').computed).toEqual(['variant'])
    expect(cssModuleReads('s[`state-${state}`]', 's').computed).toEqual(['``'])
  })
  // biome-ignore-end lint/suspicious/noTemplateCurlyInString: the forbidden pattern, as text
})

describe('findCssModuleViolations', () => {
  it('accepts a stylesheet built entirely out of tokens', () => {
    expect(
      findCssModuleViolations(
        [
          '.chip {',
          '  background: var(--jbk-surface-docked-control);',
          '  border: 1px solid var(--jbk-border-quiet-control);',
          '  border-radius: var(--jbk-radius-control);',
          '  font-size: var(--jbk-size-11-5);',
          '  padding: 0 10px;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('rejects a hex literal', () => {
    const [violation] = findCssModuleViolations('.chip { color: #1fd6bd }')
    expect(violation?.reason).toContain('colour literal')
    expect(violation?.line).toBe(1)
  })

  it('rejects rgb, rgba, hsl and hsla', () => {
    for (const value of ['rgb(0,0,0)', 'rgba(0,0,0,.5)', 'hsl(0 0% 0%)', 'hsla(0,0%,0%,.5)']) {
      expect(findCssModuleViolations(`.c { color: ${value} }`)).not.toEqual([])
    }
  })

  it('ignores a colour inside a comment', () => {
    expect(findCssModuleViolations('/* was #1fd6bd */\n.c { color: var(--jbk-accent) }')).toEqual(
      [],
    )
  })

  it('rejects a font size, font family or radius that is not a token', () => {
    expect(findCssModuleViolations('.c { font-size: 11px }')[0]?.reason).toContain('font-size')
    expect(findCssModuleViolations('.c { font-family: Archivo }')[0]?.reason).toContain(
      'font-family',
    )
    expect(findCssModuleViolations('.c { border-radius: 5px }')[0]?.reason).toContain(
      'border-radius',
    )
  })

  it('allows a radius that carries no design value', () => {
    expect(findCssModuleViolations('.c { border-radius: 0 }')).toEqual([])
    expect(findCssModuleViolations('.c { border-radius: inherit }')).toEqual([])
  })

  it('leaves padding, gap and margin alone — no token module ever carried them', () => {
    expect(findCssModuleViolations('.c { padding: 6px 12px; gap: 8px; margin: 0 }')).toEqual([])
  })

  it('rejects a class name that camelCase cannot reach through s.name', () => {
    expect(findCssModuleViolations('.chip-accent { gap: 0 }')[0]?.reason).toContain('camelCase')
  })
})
