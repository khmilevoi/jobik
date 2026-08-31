import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findCssModuleViolations,
  findSourceColourViolations,
  listCssModules,
  listSourceFiles,
} from './cssModuleSource.js'

/**
 * The raw-value gate, over every `*.module.css` and every component source in the package.
 *
 * Before the migration a colour could only come from `tokens.ts`, and an invented one
 * (`surfaces.nodeCrad`) did not compile. A stylesheet has no such protection: `background:#0f1114`
 * is valid CSS forever, and the day somebody edits `surfaces.nodeCard` the two quietly disagree.
 * This is the gate that replaces the type error.
 *
 * It also replaces four DOM-scanning discipline tests — `canvasTokenDiscipline`,
 * `runTokenDiscipline`, `outputTokenDiscipline` and `tokenDiscipline` — which rendered a tree and
 * read the colours back out of it. That mechanism died silently when the components stopped using
 * inline styles: jsdom applies no stylesheet, so the rendered DOM held no colours and the scan
 * found nothing. Those tests saw one thing this file must therefore also see — a colour written
 * straight into JSX — which is what the second `describe` is for.
 *
 * `tokens.css` is not a `*.module.css`, and the token modules are exempted below: they are the
 * files allowed to spell a colour, which is the whole point of them. The scan's own rules, and the
 * reasoning for which properties it covers and which it deliberately does not, live in
 * `cssModuleSource.ts`.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url))

const stylesheets = listCssModules(SRC)

/**
 * A file the colour ban does not apply to.
 *
 * `tokens.ts` and every `*Tokens.ts` are the source of the colours, so the rule is stated by
 * basename rather than by a list — a directory that gains a token module is covered on the day it
 * lands. A test may name an artboard colour to pin it and ships nothing. `server/` answers HTTP
 * and carries no design surface. A `.d.ts` holds no values at all.
 */
function exemptFromColourBan(relative: string): boolean {
  const name = path.basename(relative)
  return (
    relative.startsWith(`server${path.sep}`) ||
    relative.includes('.test.') ||
    name.endsWith('.d.ts') ||
    name === 'tokens.ts' ||
    name.endsWith('Tokens.ts')
  )
}

const sources = listSourceFiles(SRC).filter(
  (file) => !exemptFromColourBan(path.relative(SRC, file)),
)

describe('every *.module.css in the package', () => {
  it('finds the stylesheets to check', () => {
    expect(stylesheets.length).toBeGreaterThan(0)
  })

  it('states no design value that a token already carries', () => {
    const findings = stylesheets.flatMap((css) =>
      findCssModuleViolations(fs.readFileSync(css, 'utf8')).map(
        (violation) =>
          `${path.relative(SRC, css)}:${violation.line} ${violation.text} — ${violation.reason}`,
      ),
    )
    expect(findings).toEqual([])
  })
})

describe('every component source in the package', () => {
  it('finds the sources to check', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  it('states no colour of its own, in an inline style or an SVG attribute or anywhere else', () => {
    const findings = sources.flatMap((file) =>
      findSourceColourViolations(fs.readFileSync(file, 'utf8')).map(
        (violation) =>
          `${path.relative(SRC, file)}:${violation.line} ${violation.text} — ${violation.reason}`,
      ),
    )
    expect(findings).toEqual([])
  })
})
