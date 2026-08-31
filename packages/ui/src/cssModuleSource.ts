import * as fs from 'node:fs'
import path from 'node:path'

/**
 * Everything that reads a `*.module.css`, or the component that imports one, as text.
 *
 * Two gates share it — `cssModuleValues.test.ts`, which bans a design value stated directly in a
 * stylesheet, and `cssModuleUsage.test.ts`, which compares a component's class reads against the
 * classes its stylesheet defines in both directions. There is no generated declaration file: the
 * ambient `declare module '*.module.css'` in `css.d.ts` makes the import legal and says nothing
 * about its keys, so `cssModuleUsage.test.ts` is the only thing that catches `s.nodeCrad`.
 *
 * That puts a hard constraint on components, and it is stated in `css.d.ts` too: a class is read
 * by literal property access, never by a computed key. This module is what enforces it.
 *
 * Node-only, and deliberately not exported from the package barrel: it is a test utility, in the
 * shape of `server/testSupport.ts`, and no component ever imports it.
 */

/** `/* … *​/` only. `.module.css` files carry no `//` comments. */
const COMMENT = /\/\*[\s\S]*?\*\//g

/**
 * A selector prelude is any run of text that ends at a `{` and contains no brace itself. That
 * definition survives nesting — `@media (…) { .row { … } }` yields `@media (…) ` and ` .row ` —
 * and it never sees a declaration, because a declaration block ends at `}`.
 */
const PRELUDE = /([^{}]*)\{/g

const CLASS_NAME = /\.(-?[_a-zA-Z][\w-]*)/g

/** Every local class name the file declares, deduplicated, in source order. */
export function cssModuleClassNames(css: string): readonly string[] {
  const names: string[] = []
  const source = css.replace(COMMENT, '')
  for (const block of source.matchAll(PRELUDE)) {
    const prelude = (block[1] as string).trim()
    if (prelude.startsWith('@')) continue
    for (const match of prelude.matchAll(CLASS_NAME)) {
      const name = match[1] as string
      if (!names.includes(name)) names.push(name)
    }
  }
  return names
}

export interface CssModuleViolation {
  readonly line: number
  readonly text: string
  readonly reason: string
}

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/
/** A `property: value` pair anywhere on the line, so a one-line rule is scanned like a formatted one. */
const DECLARATION = /([a-z-]+)\s*:\s*([^;{}]+)/g
const TOKEN_ONLY_PROPERTIES = ['font-size', 'font-family', 'border-radius'] as const
/** `border-radius: 0` and `border-radius: inherit` carry no design value, so they are not drift. */
const VALUELESS = new Set(['0', 'inherit', 'initial', 'unset', 'revert', 'none'])

/**
 * Every place a `*.module.css` states a design value directly instead of reading a token.
 *
 * An inline style made an invented colour a type error — `surfaces.nodeCrad` did not compile. In a
 * stylesheet `background: #0f1114` compiles silently and drifts from `tokens.ts` forever, so this
 * scan is what buys that discipline back. Colours are the mandatory half: `tokens.css` and a
 * directory's own token stylesheet are the only files allowed to spell one.
 *
 * `font-size`, `font-family` and `border-radius` are included because their token sets are closed
 * — `tokens.ts` says of the nine-step scale that "nothing in the Studio uses a size outside it",
 * and `fontFamilies` and `radii` are the same kind of exhaustive list. A value outside them is a
 * design change, and a design change belongs in the design file, not in a component's stylesheet.
 *
 * `padding`, `margin`, `gap`, `width` and `height` are deliberately NOT included. Those were plain
 * literals in the inline styles this migration is translating (`padding: '6px 12px'`), no token
 * module ever carried them, and demanding a token here would force agents to invent the very
 * values the migration forbids inventing. `animation` is left out for the same reason: the five
 * `motion` tokens are shorthands, and a component that needs only an `animation-delay` would have
 * nothing to read.
 *
 * Named colours (`white`, `red`) are not scanned for: nothing in the package uses one, and the
 * pattern that would catch them also catches `transparent` and `currentColor`, which are not
 * design values. One turning up is a finding to report, not a value to add a token for.
 */
export function findCssModuleViolations(css: string): readonly CssModuleViolation[] {
  const violations: CssModuleViolation[] = []
  const lines = css.replace(COMMENT, (comment) => comment.replace(/[^\n]/g, ' ')).split('\n')

  lines.forEach((line, index) => {
    const report = (reason: string) => {
      violations.push({ line: index + 1, text: line.trim(), reason })
    }
    if (RAW_COLOUR.test(line)) {
      report('a colour literal — read a token with var(--jbk-…) instead')
    }
    for (const declaration of line.matchAll(DECLARATION)) {
      const property = declaration[1] as string
      const value = (declaration[2] as string).trim()
      if (
        (TOKEN_ONLY_PROPERTIES as readonly string[]).includes(property) &&
        !value.includes('var(') &&
        !VALUELESS.has(value)
      ) {
        report(`${property} must read a token with var(--jbk-…)`)
      }
    }
  })

  for (const name of cssModuleClassNames(css)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
      violations.push({
        line: 0,
        text: `.${name}`,
        reason: 'class names must be camelCase so `s.name` reaches them',
      })
    }
  }

  return violations
}

/**
 * Drops `//` and block comments while leaving string literals whole.
 *
 * Quote-aware, so a `//` inside `'https://…'` is not mistaken for a comment. It does not model
 * regex literals — a component that needed one would be the first, and this only ever runs over
 * files that import a stylesheet.
 */
export function stripComments(source: string): string {
  let out = ''
  let index = 0
  while (index < source.length) {
    const pair = source.slice(index, index + 2)
    if (pair === '//') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (pair === '/*') {
      index += 2
      while (index < source.length && source.slice(index, index + 2) !== '*/') index += 1
      index += 2
      continue
    }
    const character = source[index] as string
    if (character === "'" || character === '"' || character === '`') {
      const end = endOfString(source, index)
      out += source.slice(index, end)
      index = end
      continue
    }
    out += character
    index += 1
  }
  return out
}

/**
 * Replaces every string literal with its own empty form — `'x'` becomes `''`, a template becomes
 * an empty template. That distinction is load-bearing: `s['chip']` collapses to `s['']`, which is
 * a literal read, while ``s[`state-${x}`]`` collapses to ``s[``]``, which is not.
 */
export function stripStrings(source: string): string {
  let out = ''
  let index = 0
  while (index < source.length) {
    const character = source[index] as string
    if (character === "'" || character === '"' || character === '`') {
      const end = endOfString(source, index)
      out += character + character
      index = end
      continue
    }
    out += character
    index += 1
  }
  return out
}

function endOfString(source: string, start: number): number {
  const quote = source[start]
  let index = start + 1
  while (index < source.length && source[index] !== quote) {
    if (source[index] === '\\') index += 1
    index += 1
  }
  return index + 1
}

export interface CssModuleImport {
  /** The local name the default export is bound to. Always `s` by convention. */
  readonly binding: string
  /** The specifier as written, e.g. `./Button.module.css`. */
  readonly specifier: string
}

/** Every `import <binding> from '<…>.module.css'` in a source file. */
export function cssModuleImports(source: string): readonly CssModuleImport[] {
  const found: CssModuleImport[] = []
  const pattern = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.module\.css)['"]/g
  for (const match of stripComments(source).matchAll(pattern)) {
    found.push({ binding: match[1] as string, specifier: match[2] as string })
  }
  return found
}

export interface CssModuleReads {
  /** Class names read by literal property access, deduplicated. */
  readonly classes: readonly string[]
  /** Bracket reads whose key is not a string literal. Each one blinds the usage gate. */
  readonly computed: readonly string[]
}

/**
 * Every class a source file reads off a stylesheet binding.
 *
 * `s.chip` and `s['chip']` are seen; ``s[`chip-${tone}`]`` and `s[variant]` are not, and are
 * reported as `computed` so the gate can fail on them instead of quietly under-counting.
 */
export function cssModuleReads(source: string, binding: string): CssModuleReads {
  const noComments = stripComments(source)
  const noStrings = stripStrings(noComments)
  const guard = '(?<![\\w.$])'
  const classes: string[] = []

  for (const match of noStrings.matchAll(
    new RegExp(`${guard}${binding}\\.([A-Za-z_$][\\w$]*)`, 'g'),
  )) {
    const name = match[1] as string
    if (!classes.includes(name)) classes.push(name)
  }
  for (const match of noComments.matchAll(
    new RegExp(`${guard}${binding}\\[\\s*(['"])([^'"]+)\\1\\s*\\]`, 'g'),
  )) {
    const name = match[2] as string
    if (!classes.includes(name)) classes.push(name)
  }

  const computed: string[] = []
  for (const match of noStrings.matchAll(new RegExp(`${guard}${binding}\\[([^\\]]*)\\]`, 'g'))) {
    const key = (match[1] as string).trim()
    if (key === "''" || key === '""') continue
    computed.push(key === '' ? '<empty>' : key)
  }

  return { classes, computed }
}

/** Every `*.module.css` under a directory, recursively, as absolute paths in a stable order. */
export function listCssModules(root: string): readonly string[] {
  return listFiles(root, (name) => name.endsWith('.module.css'))
}

/** Every TypeScript source under a directory — the files that could import a stylesheet. */
export function listSourceFiles(root: string): readonly string[] {
  return listFiles(root, (name) => name.endsWith('.ts') || name.endsWith('.tsx'))
}

function listFiles(root: string, accept: (name: string) => boolean): readonly string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && accept(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
}
