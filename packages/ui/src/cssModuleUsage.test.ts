import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cssModuleClassNames,
  cssModuleImports,
  cssModuleReads,
  listCssModules,
  listSourceFiles,
} from './cssModuleSource.js'

/**
 * The typo guard for every CSS Module in the package, in one file.
 *
 * `css.d.ts` types a stylesheet as `Record<string, string>`, so `s.nodeCrad` compiles, evaluates to
 * `undefined`, renders `class="undefined"` and applies nothing — and no compiler, bundler, browser
 * or jsdom render says a word about it. There is deliberately no generated declaration per
 * stylesheet; this test is what replaces it, and it is the only thing standing between a mistyped
 * class and a silently unstyled component.
 *
 * It reads both files as text and compares them in both directions:
 *
 *   - a class a component reads must exist in the stylesheet — the typo;
 *   - a class a stylesheet defines must be read by somebody — dead CSS, which costs real bytes in
 *     `dist/index.css` and misleads the next reader into thinking a state is handled.
 *
 * Because it is static, it can only see what is written literally. That is the constraint every
 * component in this package works under: read a class as `s.name`, spell a variant map out in full
 * with `satisfies`, and never index a stylesheet with a computed key. The third test below is what
 * makes that a rule rather than a request.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url))

interface Usage {
  readonly stylesheet: string
  readonly defined: readonly string[]
  readonly importers: readonly { file: string; binding: string; read: readonly string[] }[]
  readonly computed: readonly string[]
}

function collect(): readonly Usage[] {
  const sources = listSourceFiles(SRC).map((file) => ({
    file,
    text: fs.readFileSync(file, 'utf8'),
  }))
  return listCssModules(SRC).map((stylesheet) => {
    const importers: { file: string; binding: string; read: readonly string[] }[] = []
    const computed: string[] = []
    for (const source of sources) {
      for (const imported of cssModuleImports(source.text)) {
        if (path.resolve(path.dirname(source.file), imported.specifier) !== stylesheet) continue
        const reads = cssModuleReads(source.text, imported.binding)
        importers.push({ file: source.file, binding: imported.binding, read: reads.classes })
        for (const key of reads.computed) {
          computed.push(`${path.relative(SRC, source.file)}: ${imported.binding}[${key}]`)
        }
      }
    }
    return {
      stylesheet,
      defined: cssModuleClassNames(fs.readFileSync(stylesheet, 'utf8')),
      importers,
      computed,
    }
  })
}

const usages = collect()

describe('every CSS Module and the components that read it', () => {
  it('finds the stylesheets to check', () => {
    // A walker that silently matched nothing would let every check below pass on an empty list.
    expect(usages.length).toBeGreaterThan(0)
  })

  it('is imported by at least one component', () => {
    const unused = usages
      .filter((usage) => usage.importers.length === 0)
      .map((usage) => `${path.relative(SRC, usage.stylesheet)} — nothing imports it`)
    expect(unused).toEqual([])
  })

  it('binds every stylesheet to `s`, so the reads are findable', () => {
    const misnamed = usages.flatMap((usage) =>
      usage.importers
        .filter((importer) => importer.binding !== 's')
        .map(
          (importer) =>
            `${path.relative(SRC, importer.file)} imports ${path.relative(SRC, usage.stylesheet)} as \`${importer.binding}\` — use \`s\``,
        ),
    )
    expect(misnamed).toEqual([])
  })

  it('never indexes a stylesheet with a computed key', () => {
    // `s[`state-${state}`]` compiles, runs, and makes every check here blind to whatever it read.
    // Spell the map out with `satisfies Record<Foo, string>` instead.
    const computed = usages.flatMap((usage) =>
      usage.computed.map(
        (read) => `${read} — computed key; spell the map out with satisfies Record<…, string>`,
      ),
    )
    expect(computed).toEqual([])
  })

  it('reads only classes its stylesheet defines', () => {
    const missing = usages.flatMap((usage) =>
      usage.importers.flatMap((importer) =>
        importer.read
          .filter((name) => !usage.defined.includes(name))
          .map(
            (name) =>
              `${path.relative(SRC, importer.file)} reads \`s.${name}\` but ${path.relative(SRC, usage.stylesheet)} defines no \`.${name}\``,
          ),
      ),
    )
    expect(missing).toEqual([])
  })

  it('defines no class that nobody reads', () => {
    const dead = usages.flatMap((usage) => {
      const read = new Set(usage.importers.flatMap((importer) => importer.read))
      return usage.defined
        .filter((name) => !read.has(name))
        .map(
          (name) =>
            `${path.relative(SRC, usage.stylesheet)} defines \`.${name}\` but no component reads \`s.${name}\``,
        )
    })
    expect(dead).toEqual([])
  })
})
