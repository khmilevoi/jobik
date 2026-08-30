/**
 * The wire-payload safety sweep.
 *
 * The safe flow descriptor and the error serialiser are the wall between the server and the
 * browser. This module makes that wall a tested contract rather than a convention: every test that
 * builds a wire payload runs the same sweep over it, so a new field that leaks a path, a function
 * or a `cause` fails a test instead of shipping.
 *
 * Deliberately NOT exported from the package barrel — it is an internal check, not public surface.
 * It returns findings as a value; it throws nothing.
 */

/** A leading drive letter, a UNC prefix, or a leading slash. */
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/

/**
 * Keys that must never appear anywhere in a wire payload. `path` is NOT on this list: a
 * `SchemaIssue` legitimately carries a dotted field path such as `connections.0.from`, and an
 * absolute value under any key is caught by `ABSOLUTE_PATH` regardless of what the key is called.
 */
const FORBIDDEN_KEYS: readonly string[] = ['cause', 'stack', 'run', 'handler', 'secret', 'token']

export type UnsafeFinding = {
  /** A JSON pointer into the payload, e.g. `/nodes/0/input/fields/1`. `''` is the root. */
  readonly pointer: string
  readonly reason: string
}

/**
 * Walk a payload and report everything a browser must never receive.
 *
 * Flags functions, forbidden keys, and any string that begins with an absolute path; paths
 * embedded mid-string are caught only through the `forbiddenSubstrings` needles.
 *
 * `forbiddenSubstrings` lets a caller add the concrete roots of its own fixture — a temp directory,
 * the example's directory — so a leak is caught even in a form the absolute-path pattern misses.
 * An empty string in that list is ignored, because every string contains it.
 */
export function findUnsafeValues(
  value: unknown,
  forbiddenSubstrings: readonly string[] = [],
): readonly UnsafeFinding[] {
  const needles = forbiddenSubstrings.filter((needle) => needle.length > 0)
  const findings: UnsafeFinding[] = []

  const walk = (node: unknown, pointer: string): void => {
    if (typeof node === 'function') {
      findings.push({ pointer, reason: 'function' })
      return
    }
    if (typeof node === 'string') {
      if (ABSOLUTE_PATH.test(node)) {
        findings.push({ pointer, reason: `absolute path '${node}'` })
      }
      for (const needle of needles) {
        if (node.includes(needle)) {
          findings.push({ pointer, reason: `forbidden substring '${needle}'` })
        }
      }
      return
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${pointer}/${i}`)
      }
      return
    }
    if (typeof node === 'object' && node !== null) {
      for (const [key, entry] of Object.entries(node)) {
        const childPointer = `${pointer}/${key}`
        if (FORBIDDEN_KEYS.includes(key)) {
          findings.push({ pointer: childPointer, reason: `forbidden key '${key}'` })
        }
        walk(entry, childPointer)
      }
    }
  }

  walk(value, '')
  return findings
}
