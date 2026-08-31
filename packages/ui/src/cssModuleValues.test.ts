import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findCssModuleViolations, listCssModules } from './cssModuleSource.js'

/**
 * The raw-value gate over every `*.module.css` in the package.
 *
 * Before the migration a colour could only come from `tokens.ts`, and an invented one
 * (`surfaces.nodeCrad`) did not compile. A stylesheet has no such protection: `background:#0f1114`
 * is valid CSS forever, and the day somebody edits `surfaces.nodeCard` the two quietly disagree.
 * This is the gate that replaces the type error.
 *
 * `tokens.css` is not a `*.module.css` and so is not walked — it is the one file allowed to spell
 * a colour, which is the whole point of it. The scan's own rules, and the reasoning for which
 * properties it covers and which it deliberately does not, live in `cssModuleSource.ts`.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url))

const stylesheets = listCssModules(SRC)

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
