import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `types.ts` is the only file `flow.ui.tsx` (P12) imports, so its browser-safety cannot regress
 * silently. This reads the source text rather than importing the module, because importing it
 * would prove nothing about which `node:` builtins or handlers it pulls in transitively.
 */

const typesPath = path.resolve(path.dirname(import.meta.filename), 'types.ts')
const source = fs.readFileSync(typesPath, 'utf8')
const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line))

describe('types.ts stays browser-safe', () => {
  it('declares at least one import to guard', () => {
    expect(importLines.length).toBeGreaterThan(0)
  })

  it('imports no node: builtin', () => {
    expect(source, 'types.ts must not import a node: builtin').not.toMatch(/from\s+['"]node:/)
  })

  it('imports nothing from ./nodes/', () => {
    expect(source, 'types.ts must not import a handler from ./nodes/').not.toMatch(
      /from\s+['"]\.\/nodes\//,
    )
  })

  it('every import statement is type-only', () => {
    for (const line of importLines) {
      expect(line, `expected a type-only import, got: ${line.trim()}`).toMatch(/^\s*import type\b/)
    }
  })
})
