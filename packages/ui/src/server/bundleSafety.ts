/**
 * The disclosure guard for the flow-UI extension bundle.
 *
 * `GET /api/flows/:id/ui.js` is the one response body on the whole surface that Jobik does not
 * build field by field. Everything else the browser can see is assembled by `descriptor.ts` or
 * `wireError.ts` out of declared fields, and swept in tests by `wireSafety.ts`; a bundler's chunk
 * is handed over as it came. So it gets its own wall.
 *
 * What this looks for is a class, not a string. Today rolldown labels each inlined module with a
 * `//#region <id>` comment; a sourcemap comment, an oxc `_jsxFileName`, or the next annotation a
 * bundler grows would ride the same route with no check in front of it. Scanning the emitted text
 * for path *shapes* is what survives that, which is why nothing here knows what `//#region` is.
 *
 * Deliberately NOT exported from the package barrel — an internal check, like `wireSafety.ts` and
 * `stackFrames.ts`. It returns findings as a value and throws nothing.
 */

/**
 * Where a path-shaped token ends: the quotes, whitespace and brackets a path is ever written
 * between in JavaScript. A separator is not one of them, so a whole path is captured. Written as a
 * plain string rather than `String.raw` because it contains a backtick.
 */
const TAIL = '[^\\s\'"`;,()\\[\\]{}]*'

/**
 * A path may only *start* at one of those delimiters. Anything else in front of it — a word
 * character, a separator, a `:`, the `$` of an admin share — means the match is the tail of a
 * longer token that another rule already owns, and reporting it twice helps nobody.
 */
const AT_BOUNDARY = '(?<![^\\s\'"`;,()\\[\\]{}])'

type Rule = { readonly reason: string; readonly pattern: RegExp }

/**
 * The three absolute forms. None can legitimately appear in a bundle a browser executes: the
 * browser has no filesystem, so a filesystem path in the body is disclosure and nothing else.
 */
const ABSOLUTE_RULES: readonly Rule[] = [
  {
    reason: 'drive-letter path',
    // `C:/flows/x.tsx` and `C:\flows\x.tsx`. This is the form the leak took — rolldown normalises
    // a module id to forward slashes, so the drive letter is what survived. The lookbehind is what
    // keeps `http://…` out: without it, `p:/` in every URL matches.
    pattern: new RegExp(String.raw`(?<![A-Za-z0-9])[A-Za-z]:[\\/]${TAIL}`, 'g'),
  },
  {
    reason: 'UNC path',
    // `\\host\share\…`, its doubled spelling inside a string literal, and the forward-slash form
    // rolldown's normaliser turns it into — the reproduction showed it rewriting `C:\…` to `C:/…`,
    // so a UNC id would arrive as `//host/share/…`. Two separators after the host are required,
    // which is what keeps an ordinary `//comment` out, and the lookbehind is what keeps
    // `https://host/a/b` out.
    //
    // A protocol-relative URL (`//cdn.example.com/assets/lib.js`) is genuinely indistinguishable
    // from a UNC path by shape, and is flagged. That is the deliberate direction for a guard on
    // the one body nothing else inspects: the author gets a console line naming the token and a
    // one-word fix, where the alternative is serving `//127.0.0.1/C$/Users/…` to a browser.
    pattern: new RegExp(
      String.raw`(?<![:\w/\\])(?:\\{2,4}|//)[A-Za-z0-9._-]+[\\/]${TAIL}[\\/]${TAIL}`,
      'g',
    ),
  },
  {
    reason: 'POSIX absolute path',
    // Reachable only across a mount, since `path.relative` on POSIX never returns an absolute
    // result. A bare leading `/` is division, a regex and half of every URL, so the source-file
    // extension and the boundary are what make this rule precise enough to fail closed on.
    pattern: new RegExp(`${AT_BOUNDARY}${String.raw`/(?:[\w.@-]+/)+[\w.-]+\.[cm]?[jt]sx?\b`}`, 'g'),
  },
]

/**
 * A relative chain that climbs out of the flow directory and then *names* something.
 *
 * Not absolute, so no rule above sees it — but `../../../../../../../JsProjects/jobik/examples/…`
 * discloses the directory chain above the flow exactly as plainly, and that is the disclosure
 * `descriptor.ts` refuses when it reduces `documentPath` to a bare file name.
 *
 * The trailing directory segment is load-bearing, not decoration. The publication example's own
 * `RenderedImage.tsx` carries the prose comment "Imports only `@jobik/ui` and `../types.js`", and
 * a rule that flagged every `../` would refuse to serve the flow this repository ships. A chain
 * followed by a *file* names no directory outside the flow; a chain followed by a directory does.
 */
const PARENT_CHAIN: Rule = {
  reason: 'parent-directory chain naming a directory outside the flow',
  pattern: new RegExp(String.raw`(?<![\w.])(?:\.\.[\\/])+[\w.@-]+[\\/]${TAIL}`, 'g'),
}

const RULES: readonly Rule[] = [...ABSOLUTE_RULES, PARENT_CHAIN]

/**
 * A base64 `data:` payload, which must be masked before the rules run.
 *
 * Vite inlines every local asset as a `data:` URI in a lib build — unconditionally, before
 * `assetsInlineLimit` is even consulted (`shouldInline` returns on `build.lib`) — so an
 * `import bg from './bg.png'` in a `flow.ui.tsx` drops a base64 blob straight into the chunk this
 * sweeps. The base64 alphabet contains `+` and `/`, and the UNC rule's lookbehind does not exclude
 * `+`, so a chance `+//xxx/yyy` inside the blob matched as a UNC path and the bundle was refused.
 * Measured on random payloads: 0/300 at 200 B, 45/300 at 60 kB, 110/300 at 200 kB — an
 * intermittent, size-dependent 500 naming a token the author never wrote.
 *
 * Masking rather than widening the lookbehind, because the lookbehind is whack-a-mole (`=` is
 * next) and the actual defect is that an opaque blob is scanned for path shapes at all. A base64
 * payload cannot disclose a readable path, so removing it from the sweep loses no coverage.
 *
 * The mime part is matched with `[^,]*`, not `[^;,]*`: a parameterised type
 * (`data:image/png;charset=utf-8;base64,…`) carries a `;` before `;base64,`, and the narrower
 * class cannot reach across it — which would reinstate the bug on the input that most looks like
 * the one this was written for. Whitespace is allowed inside the payload because a formatter may
 * wrap a long literal.
 *
 * Only base64 is masked. `data:image/svg+xml;utf8,<svg …>` stays readable text and is still swept.
 */
const BASE64_PAYLOAD = /data:[^,\s'"`]*;base64,[A-Za-z0-9+/=\s]+/g

/**
 * Replace every base64 payload with a same-shaped run of a character no rule can match, keeping
 * newlines so reported line numbers still point at the real line.
 */
function maskBase64Payloads(code: string): string {
  return code.replace(BASE64_PAYLOAD, (payload) => payload.replace(/[^\n]/g, 'A'))
}

export type BundleDisclosure = {
  /** 1-based line in the emitted chunk, so the server console can point the author at it. */
  readonly line: number
  readonly reason: string
  /** The offending token. Capped: this is a pointer for the author, not a dump of the chunk. */
  readonly token: string
}

/** Long enough to identify the path, short enough that a console line stays readable. */
const MAX_TOKEN = 200

/**
 * Every filesystem path the emitted bundle would disclose to the browser.
 *
 * An empty array is the only result that may be served. The patterns are `g`-flagged and therefore
 * stateful, but `matchAll` resets `lastIndex` itself, so a shared `RegExp` is safe here.
 */
export function findBundleDisclosures(code: string): readonly BundleDisclosure[] {
  const swept = maskBase64Payloads(code)
  const findings: BundleDisclosure[] = []
  for (const rule of RULES) {
    for (const match of swept.matchAll(rule.pattern)) {
      findings.push({
        line: lineOf(swept, match.index),
        reason: rule.reason,
        token: match[0].slice(0, MAX_TOKEN),
      })
    }
  }
  return findings.sort((a, b) => a.line - b.line)
}

function lineOf(code: string, index: number): number {
  let line = 1
  for (let at = 0; at < index; at += 1) {
    if (code[at] === '\n') line += 1
  }
  return line
}
