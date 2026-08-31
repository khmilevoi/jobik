import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { findBundleDisclosures } from './bundleSafety.js'
import { buildExtensionBundle, clearExtensionBundleCache } from './extensionBundle.js'
import { serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow, uiPath } from './testSupport.js'
import { findUnsafeValues } from './wireSafety.js'

setupCleanups()

/**
 * `GET /api/flows/:id/ui.js` is the one response body Jobik does not build field by field, and the
 * one no test used to sweep. It served rolldown's `//#region <id>` comments verbatim, and those
 * ids were relative to `process.cwd()` rather than to the flow — so the same flow served a
 * different body depending on where the server was started, and from a cwd on another volume root
 * it served an absolute path outright.
 *
 * This file pins both halves of the answer: the ids are now the flow's own layout whatever the
 * cwd, and a bundle that names a filesystem path anyway is refused rather than served.
 */

/** Rolldown's first build in a process is the slow one; the shared 20 s project timeout is tight. */
const BUILD_TIMEOUT = 120_000

/** Both separator spellings of a path — the bundler normalises to `/`, Node reports `\`. */
function spellings(target: string): readonly string[] {
  return [target, target.replaceAll('\\', '/'), target.replaceAll('/', '\\')]
}

/**
 * Every root a bundle of this fixture could disclose. The needles are what make the sweep bite: a
 * path embedded mid-string is invisible to `findUnsafeValues`' own anchored pattern.
 */
const FORBIDDEN: readonly string[] = [
  ...spellings(publicationFixture.root),
  ...spellings(path.dirname(publicationFixture.root)),
  ...spellings(publicationFixture.bindingPath),
  ...spellings(process.cwd()),
  ...spellings(os.homedir()),
  ...spellings(os.tmpdir()),
]

/** The ids rolldown writes today. Pinned by name so the concrete annotation is covered too. */
function regionIds(code: string): readonly string[] {
  return [...code.matchAll(/^\/\/#region (.+)$/gm)].map((match) => match[1])
}

/** Build once with `process.cwd()` moved, and always put it back. */
async function buildFrom(cwd: string): Promise<string> {
  const original = process.cwd()
  try {
    process.chdir(cwd)
    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath })
    if (code instanceof Error) throw code
    return code
  } finally {
    process.chdir(original)
  }
}

/**
 * The UNC spelling of the temp directory — `\\127.0.0.1\C$\…`. This machine has a single drive
 * letter, so a UNC cwd is how the audit reached the cross-volume case that `path.relative` answers
 * with the target's absolute path. Not reachable everywhere (it needs the admin share), so the
 * caller treats an unusable value as a skip rather than a failure.
 */
function uncSpellingOfTmp(): string | undefined {
  const temporary = os.tmpdir()
  const drive = /^([A-Za-z]):\\(.*)$/.exec(temporary)
  if (process.platform !== 'win32' || drive === null) return undefined
  return `\\\\127.0.0.1\\${drive[1]}$\\${drive[2]}`
}

describe('findBundleDisclosures', () => {
  it('flags the drive-letter id the cross-volume case produced', () => {
    const code = '//#region C:/Users/someone/flows/publication/types.ts\nexport const a = 1\n'
    expect(findBundleDisclosures(code)).toEqual([
      {
        line: 1,
        reason: 'drive-letter path',
        token: 'C:/Users/someone/flows/publication/types.ts',
      },
    ])
  })

  it('flags a backslash drive-letter path inside a string literal', () => {
    const found = findBundleDisclosures('const f = "D:\\\\flows\\\\x.tsx"\n')
    expect(found.map((finding) => finding.reason)).toEqual(['drive-letter path'])
  })

  it('flags a UNC path in either spelling', () => {
    const forward = findBundleDisclosures('//#region //127.0.0.1/C$/flows/x.tsx\n')
    expect(forward.map((finding) => finding.reason)).toEqual(['UNC path'])
    const backward = findBundleDisclosures('const f = "\\\\\\\\host\\\\share\\\\x.tsx"\n')
    expect(backward.map((finding) => finding.reason)).toEqual(['UNC path'])
  })

  it('flags a POSIX absolute source path', () => {
    const found = findBundleDisclosures('//#region /home/someone/flows/publication/flow.ui.tsx\n')
    expect(found).toEqual([
      {
        line: 1,
        reason: 'POSIX absolute path',
        token: '/home/someone/flows/publication/flow.ui.tsx',
      },
    ])
  })

  it('flags a parent chain that names a directory above the flow', () => {
    // Row 2 of the audit's table: not absolute, so no rule above sees it, and it discloses the
    // whole directory chain the flow sits under.
    const found = findBundleDisclosures('//#region ../../../JsProjects/jobik/examples/x/types.ts\n')
    expect(found.map((finding) => finding.reason)).toEqual([
      'parent-directory chain naming a directory outside the flow',
    ])
  })

  it('reports the line a disclosure sits on', () => {
    const found = findBundleDisclosures(`const a = 1\n\n//#region C:/flows/x.tsx\n`)
    expect(found.map((finding) => finding.line)).toEqual([3])
  })

  it('passes the shapes a legitimate bundle is full of', () => {
    // Every one of these was a false positive at some point while the rules were being written.
    // The `../types.js` line is not invented: it is the prose comment in the publication example's
    // own `RenderedImage.tsx`, and flagging it would refuse to serve the flow this repo ships.
    const code = [
      '//#region types.ts',
      '//#region components/RenderedImage.tsx',
      "import { defineFlowUi } from '@jobik/ui'",
      "import { jsx } from 'react/jsx-runtime'",
      '/** Imports only `@jobik/ui` and `../types.js` — never a handler. */',
      "const url = 'https://cdn.example.com/assets/v1/image.js'",
      "const port = 'http://127.0.0.1:4318/api/flows'",
      'const ratio = width / height / 2',
      'const trimmed = text.replace(/a\\/b/g, "")',
    ].join('\n')
    expect(findBundleDisclosures(code)).toEqual([])
  })

  it('flags a protocol-relative URL, which is a UNC path by shape', () => {
    // Deliberate, and the one place the guard is knowingly over-eager: `//host/share/x` and
    // `//cdn/assets/x` are the same string. Failing closed is the right direction on the one body
    // nothing else inspects — the alternative is serving `//127.0.0.1/C$/Users/…` — and the author
    // gets the token on the console. Pinned so the trade-off is a decision, not a surprise.
    const found = findBundleDisclosures("const src = '//cdn.example.com/assets/lib.js'\n")
    expect(found.map((finding) => finding.reason)).toEqual(['UNC path'])
  })
})

describe('the flow UI bundle is browser-safe', () => {
  it('serves ids that are the flow layout, whatever the cwd', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const fromRepoRoot = await buildFrom(process.cwd())
    const fromOutside = await buildFrom(os.tmpdir())
    expect(regionIds(fromRepoRoot)).toEqual([
      'types.ts',
      'components/RenderedImage.tsx',
      'flow.ui.tsx',
    ])
    // The bug in one line: these two bodies used to differ, and the second one disclosed the
    // directory chain above the flow.
    expect(fromOutside).toBe(fromRepoRoot)

    const unc = uncSpellingOfTmp()
    if (unc === undefined) return
    let fromAnotherVolume: string
    try {
      fromAnotherVolume = await buildFrom(unc)
    } catch {
      // The admin share is not reachable here; the two cwds above still cover the finding.
      return
    }
    // The row of the audit's table that produced `//#region C:/Users/…/types.ts` in a 200 body.
    expect(fromAnotherVolume).toBe(fromRepoRoot)
  })

  it('leaks nothing on the success body of GET /api/flows/:id/ui.js', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    const flow = await temporaryFlow()
    const server = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows/${flow.id}/ui.js`)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('RenderedImage')

    // The sweep the run stream gets, over the whole response text. `findUnsafeValues`' own
    // absolute-path pattern is anchored, so for one long string it is the needles that bite —
    // which is exactly the form the leak took, a path embedded in a comment mid-body.
    expect(findUnsafeValues(body, [...FORBIDDEN, ...spellings(flow.documentPath)])).toEqual([])
    // And the class check, which does not know what `//#region` is and will catch the next
    // annotation rolldown adds.
    expect(findBundleDisclosures(body)).toEqual([])
    // Today's annotation, pinned by name: every id is relative and inside the flow.
    for (const id of regionIds(body)) {
      expect(path.isAbsolute(id)).toBe(false)
      expect(id.startsWith('..')).toBe(false)
    }
  })

  it('refuses to serve a bundle that names a directory above the flow', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // A flow whose extension inlines a module from outside its own directory: rolldown labels it
    // with a chain that climbs out of the flow root, which is the disclosure of row 2. The guard
    // has to fire on a real build, not only on a synthetic string.
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-escaping-ui-'))
    pushCleanup(() => fs.rm(directory, { recursive: true, force: true }))
    const flowRoot = path.join(directory, 'flow')
    await fs.mkdir(path.join(directory, 'shared'), { recursive: true })
    await fs.mkdir(flowRoot, { recursive: true })
    // A function, not a constant: rolldown folds a constant into its one use and drops the module
    // label with it, and then there is nothing for the guard to find.
    await fs.writeFile(
      path.join(directory, 'shared', 'caption.ts'),
      'export function caption(n) { return "shared " + n }\n',
      'utf8',
    )
    const escaping = path.join(flowRoot, 'flow.ui.tsx')
    await fs.writeFile(
      escaping,
      [
        'import { caption } from "../shared/caption.js"',
        'export default { render: (n) => caption(n) }',
        '',
      ].join('\n'),
      'utf8',
    )

    clearExtensionBundleCache()
    expect(await buildExtensionBundle({ uiPath: escaping })).toBeInstanceOf(Error)
  })
})

/**
 * The base64 regression.
 *
 * Vite inlines every local asset as a `data:` URI in a lib build, so `import bg from './bg.png'`
 * drops a base64 blob into the very chunk this guard sweeps. The blob is opaque, but its alphabet
 * supplies `+` and `/`, and the UNC rule's lookbehind does not exclude `+` — so a chance sequence
 * inside the payload matched as a path and the bundle was refused. Measured before the fix on
 * random payloads: 0/300 at 200 B, 45/300 at 60 kB, 110/300 at 200 kB.
 *
 * The fixtures below are deterministic on purpose. A random payload reproduces the bug only
 * sometimes, which is a property of the fixture rather than of the guard, and is exactly how this
 * survived its own test suite the first time.
 */
describe('a base64 data: payload', () => {
  /**
   * Lifted verbatim from a real reproduction. Three parts are all load-bearing: the `+` that the
   * lookbehind fails to exclude, and the TWO later `/` separators the rule requires after the host
   * segment. Drop either separator and the rule no longer matches — which is how a shortened
   * fixture can silently stop testing anything.
   */
  const COLLIDING =
    'iVBORw0KGgoAAAA+//NvKRfef/UFSQSZ73fPWVy4U3lequMUDuixIY8TSUPP04rM19GeMA/1wd9PAAAA=='

  it('is not mistaken for a UNC path', () => {
    const code = `const bg = "data:image/png;base64,${COLLIDING}";\nexport default bg\n`
    expect(findBundleDisclosures(code)).toEqual([])
  })

  it('is masked even when the media type carries a parameter', () => {
    // `[^;,]*` cannot cross the `;` of `charset=utf-8`, which would put the bug straight back.
    const code = `const bg = "data:image/png;charset=utf-8;base64,${COLLIDING}"\n`
    expect(findBundleDisclosures(code)).toEqual([])
  })

  it('is masked when a formatter has wrapped the literal across lines', () => {
    // The collision sits wholly on the second line, so the mask only covers it if the payload
    // class spans the newline. That is what `\s` inside the class is for.
    const wrapped = `iVBORw0KGgoAAAAAAAAA\n  ${COLLIDING}`
    expect(findBundleDisclosures(`const bg = "data:image/png;base64,${wrapped}"\n`)).toEqual([])
  })

  it('does not blind the guard to a real path on a later line', () => {
    const code = [
      `const bg = "data:image/png;base64,${COLLIDING}"`,
      'const leaked = "C:/Users/someone/flows/publication/flow.ui.tsx"',
    ].join('\n')
    const found = findBundleDisclosures(code)
    expect(found.map((finding) => [finding.line, finding.reason])).toEqual([
      [2, 'drive-letter path'],
    ])
  })

  it('is masked without the `=` padding, which is the shape vite actually emits', () => {
    // Measured, not assumed: vite emits the inlined `data:` URI with the base64 padding stripped.
    // So a rule that required `=` to terminate the payload would mask the fixtures above and miss
    // every real build.
    const unpadded = COLLIDING.replace(/=+$/, '')
    expect(findBundleDisclosures(`const bg = "data:image/png;base64,${unpadded}"\n`)).toEqual([])
  })

  it('still sweeps a data: URI that is not base64', () => {
    // `svg+xml;utf8,` stays readable text, so a path written into it is a real disclosure.
    const svg = 'data:image/svg+xml;utf8,<svg><image href="C:/Users/someone/bg.png"/></svg>'
    expect(findBundleDisclosures(`const bg = "${svg}"\n`)).toHaveLength(1)
  })
})
