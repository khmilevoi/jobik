import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as jobik from '@jobik/core'

/**
 * The trimmed stack the design's failed-run panel shows.
 *
 * `## Errors` allows this and fences it: "the server may attach a `frames` array of
 * `{ fn, file, line }` to a `NodeExecutionError` on the wire, capped at the first frames inside
 * flow code with the remainder reported as a hidden count. Raw `Error.stack` strings and `cause`
 * objects are still never sent."
 *
 * Two rules make that safe rather than merely intended:
 *
 * 1. A frame is emitted only when its file resolves INSIDE the flow root, so a frame from
 *    `node_modules`, from `@jobik/core` or from Node itself can never be sent at all.
 * 2. An emitted frame's `file` is relative to the flow root with POSIX separators, so no wire
 *    payload ever carries an absolute path. `wireSafety.findUnsafeValues` fails a test if that
 *    slips.
 */

/**
 * The most frames the wire ever carries. The design's failed panel shows two above its
 * `↳ 6 frames hidden` line; this is an upper bound, not a target.
 */
export const MAX_WIRE_FRAMES = 4

/** `at fn (location)` or a bare `at location`. The location keeps its `:line:column` suffix. */
const FRAME = /^\s*at\s+(?:(?<fn>.+?)\s+\((?<parenthesised>.+?)\)|(?<bare>\S.*?))\s*$/

/** Split a location's trailing `:line:column`. The file part may itself contain colons. */
const LOCATION = /^(?<file>.*):(?<line>\d+):(?<column>\d+)$/

/** One frame as the runtime reported it: `file` is absolute and platform-native. */
export type ParsedStackFrame = { readonly fn: string; readonly file: string; readonly line: number }

/** Node prints a `file://` URL for an ES module and a plain path for CommonJS. Accept both. */
function fileOf(location: string): string {
  if (!location.startsWith('file://')) return location
  try {
    return fileURLToPath(location)
  } catch {
    return location
  }
}

/** Parse a `Error.stack` string. Anything that is not a frame — the message line, a native frame
 *  with no `:line:column` — is dropped rather than guessed at. */
export function parseStackFrames(stack: string): readonly ParsedStackFrame[] {
  const frames: ParsedStackFrame[] = []
  for (const raw of stack.split('\n')) {
    const match = FRAME.exec(raw)
    if (match === null) continue
    const groups = match.groups as
      | { fn?: string; parenthesised?: string; bare?: string }
      | undefined
    const location = groups?.parenthesised ?? groups?.bare
    if (location === undefined) continue
    const parsed = LOCATION.exec(location)
    if (parsed === null) continue
    const parts = parsed.groups as { file?: string; line?: string } | undefined
    if (parts?.file === undefined || parts.line === undefined) continue
    frames.push({
      fn: groups?.fn ?? '<anonymous>',
      file: fileOf(parts.file),
      line: Number(parts.line),
    })
  }
  return frames
}

/** Whether `file` sits inside `root`. A relative or non-existent file is never inside anything. */
function isInside(root: string, file: string): boolean {
  if (!path.isAbsolute(file)) return false
  const relative = path.relative(root, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Relative to the flow root, always with `/`, so the wire shape is identical on every platform. */
function relativeFileOf(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

/**
 * The stack worth trimming.
 *
 * A `NodeExecutionError` is constructed inside `packages/core/src/run/execute.ts`, so ITS stack
 * describes the engine, never the flow. The handler's real stack is on `cause`. The wrapper's own
 * stack is the fallback for the case where nothing was thrown at all.
 */
function stackOf(error: unknown): string | undefined {
  const cause: unknown = error instanceof Error ? error.cause : undefined
  if (cause instanceof Error && typeof cause.stack === 'string') return cause.stack
  if (error instanceof Error && typeof error.stack === 'string') return error.stack
  return undefined
}

/**
 * The `frames` / `hiddenFrames` pair for one failed node.
 *
 * `hiddenFrames` counts every frame the stack had and the wire does not carry — frames outside the
 * flow root as well as in-flow frames beyond `MAX_WIRE_FRAMES` — which is what the panel's
 * `↳ n frames hidden` line means.
 */
export function trimStackFrames(args: { error: unknown; flowRoot: string }): {
  readonly frames: readonly jobik.StackFrame[]
  readonly hiddenFrames: number
} {
  const stack = stackOf(args.error)
  if (stack === undefined) return { frames: [], hiddenFrames: 0 }
  const parsed = parseStackFrames(stack)
  const kept = parsed
    .filter((frame) => isInside(args.flowRoot, frame.file))
    .slice(0, MAX_WIRE_FRAMES)
  return {
    frames: kept.map((frame) => ({
      fn: frame.fn,
      file: relativeFileOf(args.flowRoot, frame.file),
      line: frame.line,
    })),
    hiddenFrames: parsed.length - kept.length,
  }
}
