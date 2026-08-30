import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defineJobikConfig,
  JOBIK_DEFAULT_HOST,
  JOBIK_DEFAULT_PORT,
  normaliseJobikConfig,
} from './config.js'

const binding = path.resolve('/flows/publication/index.ts')
const ui = path.resolve('/flows/publication/flow.ui.tsx')

describe('defineJobikConfig', () => {
  it('returns the spec example unchanged', () => {
    const config = defineJobikConfig({
      server: { host: '127.0.0.1', port: 4318 },
      flows: [{ binding, ui }],
    })
    expect(config).toEqual({
      server: { host: '127.0.0.1', port: 4318 },
      flows: [{ binding, ui }],
    })
  })

  it('defaults host and port to the spec values', () => {
    const config = defineJobikConfig({ flows: [{ binding, ui }] })
    expect(config.server).toEqual({ host: JOBIK_DEFAULT_HOST, port: JOBIK_DEFAULT_PORT })
    expect(JOBIK_DEFAULT_HOST).toBe('127.0.0.1')
    expect(JOBIK_DEFAULT_PORT).toBe(4318)
  })

  it('accepts an empty flow list', () => {
    expect(defineJobikConfig({ flows: [] }).flows).toEqual([])
  })

  it('accepts port 0, which asks the OS for an ephemeral port', () => {
    expect(defineJobikConfig({ server: { port: 0 }, flows: [] }).server.port).toBe(0)
  })

  it('freezes what it returns, so a later mutation cannot reach the server', () => {
    const config = defineJobikConfig({ flows: [{ binding, ui }] })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.server)).toBe(true)
    expect(Object.isFrozen(config.flows)).toBe(true)
    expect(Object.isFrozen(config.flows[0])).toBe(true)
  })

  it('rejects a relative binding path', () => {
    expect(() =>
      defineJobikConfig({ flows: [{ binding: 'flows/publication/index.ts', ui }] }),
    ).toThrow(TypeError)
    expect(() =>
      defineJobikConfig({ flows: [{ binding: 'flows/publication/index.ts', ui }] }),
    ).toThrow(/flows\[0\]\.binding must be an absolute path/)
  })

  it('rejects a relative ui path', () => {
    expect(() => defineJobikConfig({ flows: [{ binding, ui: './flow.ui.tsx' }] })).toThrow(
      /flows\[0\]\.ui must be an absolute path/,
    )
  })

  it('rejects two entries with the same binding entrypoint', () => {
    expect(() =>
      defineJobikConfig({
        flows: [
          { binding, ui },
          { binding, ui },
        ],
      }),
    ).toThrow(/duplicate binding entrypoint/)
  })

  it('rejects a non-integer or out-of-range port', () => {
    expect(() => defineJobikConfig({ server: { port: 4318.5 }, flows: [] })).toThrow(
      /server\.port must be an integer/,
    )
    expect(() => defineJobikConfig({ server: { port: 70000 }, flows: [] })).toThrow(
      /server\.port must be an integer/,
    )
  })

  it('rejects an empty host', () => {
    expect(() => defineJobikConfig({ server: { host: '' }, flows: [] })).toThrow(
      /server\.host must be a non-empty string/,
    )
  })
})

describe('normaliseJobikConfig', () => {
  it('validates a value that never went through defineJobikConfig', () => {
    expect(normaliseJobikConfig({ flows: [{ binding, ui }] }).flows).toHaveLength(1)
  })

  it('rejects a non-object and a missing flow list', () => {
    expect(() => normaliseJobikConfig(42)).toThrow(/expected a configuration object/)
    expect(() => normaliseJobikConfig({})).toThrow(/`flows` must be an array/)
  })
})
