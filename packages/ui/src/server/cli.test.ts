import { afterEach, describe, expect, it, vi } from 'vitest'
import { runJobikCli } from './cli.js'

/**
 * Argument parsing only. Every case here stops before `locateConfig`, so none of them reads the
 * filesystem, loads a config or opens a socket: `--help` returns ahead of it, and a rejected
 * option returns ahead of it too.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

function silence() {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('runJobikCli argument parsing', () => {
  it('prints usage and succeeds for --help', async () => {
    silence()
    await expect(runJobikCli(['--help'])).resolves.toEqual({ code: 0 })
  })

  it('skips a bare `--`, which is what a package manager forwards', async () => {
    silence()
    // `pnpm dev -- --port 4400` reaches the CLI as `['--', '--port', '4400']`. Before this was
    // handled the separator was reported as `unknown option '--'` and the documented invocation
    // exited 2 without ever starting.
    await expect(runJobikCli(['--', '--help'])).resolves.toEqual({ code: 0 })
  })

  it('still rejects a genuinely unknown option', async () => {
    silence()
    await expect(runJobikCli(['--nope'])).resolves.toEqual({ code: 2 })
  })

  it('rejects a flag whose value is missing', async () => {
    silence()
    await expect(runJobikCli(['--port'])).resolves.toEqual({ code: 2 })
  })

  it('rejects a port that is not an integer in range', async () => {
    silence()
    await expect(runJobikCli(['--port', '99999', '--help'])).resolves.toEqual({ code: 2 })
  })
})
