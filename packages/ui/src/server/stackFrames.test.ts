import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_WIRE_FRAMES, parseStackFrames, trimStackFrames } from './stackFrames.js'

/**
 * Absolute, but synthesised rather than real: `path.resolve` gives these a drive letter on Windows
 * and a leading slash elsewhere, so one fixture exercises both platforms' absolute-path shapes.
 */
const flowRoot = path.resolve('jobik-stack-fixture', 'publication')
const handlerFile = path.join(flowRoot, 'nodes', 'imageOut.ts')
const nestedFile = path.join(flowRoot, 'nodes', 'png.ts')
const outsideFile = path.resolve('jobik-stack-fixture', 'core', 'execute.ts')

function stackOf(...lines: readonly string[]): string {
  return ['Error: boom', ...lines].join('\n')
}

describe('parseStackFrames', () => {
  it('reads a named frame with a plain absolute path', () => {
    expect(parseStackFrames(stackOf(`    at raster (${handlerFile}:184:11)`))).toEqual([
      { fn: 'raster', file: handlerFile, line: 184 },
    ])
  })

  it('reads a frame whose location is a file:// URL, which is what Node prints for ESM', () => {
    const url = pathToFileURL(handlerFile).href
    expect(parseStackFrames(stackOf(`    at raster (${url}:184:11)`))).toEqual([
      { fn: 'raster', file: handlerFile, line: 184 },
    ])
  })

  it('reads an anonymous frame, which has no parentheses at all', () => {
    expect(parseStackFrames(stackOf(`    at ${handlerFile}:12:3`))).toEqual([
      { fn: '<anonymous>', file: handlerFile, line: 12 },
    ])
  })

  it('ignores the message line and anything that is not a frame', () => {
    expect(parseStackFrames(stackOf('    at Object.<anonymous> (node:internal/main:1)'))).toEqual(
      [],
    )
  })
})

describe('trimStackFrames', () => {
  it('keeps only the frames inside flow code, relativised with forward slashes', () => {
    const cause = new Error('boom')
    cause.stack = stackOf(
      `    at raster (${handlerFile}:184:11)`,
      `    at encodePng (${nestedFile}:22:7)`,
      `    at invoke (${outsideFile}:41:3)`,
    )
    expect(trimStackFrames({ error: cause, flowRoot })).toEqual({
      frames: [
        { fn: 'raster', file: 'nodes/imageOut.ts', line: 184 },
        { fn: 'encodePng', file: 'nodes/png.ts', line: 22 },
      ],
      hiddenFrames: 1,
    })
  })

  it('caps the frames it sends and reports the rest as hidden', () => {
    const cause = new Error('boom')
    const deep = Array.from(
      { length: MAX_WIRE_FRAMES + 3 },
      (_unused, index) => `    at frame${index} (${handlerFile}:${index + 1}:1)`,
    )
    cause.stack = stackOf(...deep)
    const trimmed = trimStackFrames({ error: cause, flowRoot })
    expect(trimmed.frames).toHaveLength(MAX_WIRE_FRAMES)
    expect(trimmed.hiddenFrames).toBe(3)
  })

  it('prefers the cause stack, because the wrapper was constructed inside core', () => {
    const cause = new Error('boom')
    cause.stack = stackOf(`    at raster (${handlerFile}:184:11)`)
    const wrapper = new Error('Node render failed', { cause })
    wrapper.stack = stackOf(`    at execute (${outsideFile}:212:5)`)
    expect(trimStackFrames({ error: wrapper, flowRoot }).frames).toEqual([
      { fn: 'raster', file: 'nodes/imageOut.ts', line: 184 },
    ])
  })

  it('never emits an absolute file, even for a frame that sits exactly on the root', () => {
    const cause = new Error('boom')
    cause.stack = stackOf(`    at boot (${path.join(flowRoot, 'index.ts')}:3:1)`)
    const trimmed = trimStackFrames({ error: cause, flowRoot })
    expect(trimmed.frames).toEqual([{ fn: 'boot', file: 'index.ts', line: 3 }])
    expect(trimmed.frames.every((frame) => !path.isAbsolute(frame.file))).toBe(true)
  })

  it('returns nothing for a value that carries no stack', () => {
    expect(trimStackFrames({ error: 'not an error', flowRoot })).toEqual({
      frames: [],
      hiddenFrames: 0,
    })
  })
})
