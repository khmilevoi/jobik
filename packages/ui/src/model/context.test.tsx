import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient } from '#client/index.js'
import { StudioModelProvider, useStudioModel } from './context.js'
import { reatomStudio } from './studio.js'
import type { StudioDeps, StudioModel } from './types.js'

/**
 * Nothing here calls the client: `reatomStudio` builds units and every request is behind a
 * `computed` nothing in this file reads, so the stub only has to satisfy the type. It is the same
 * shape every other model test builds. What the composition itself does is
 * `studio.test.ts`'s subject; this file is about the React context that carries one.
 */
const CLIENT = {
  listFlows: vi.fn(),
  loadFlow: vi.fn(),
  validate: vi.fn(),
  save: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  assetUrl: vi.fn(() => '/api/assets/x'),
  extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
} as unknown as JobikClient

const DEPS: StudioDeps = { client: CLIENT, now: () => 1_700_000_000_000 }

/** Reads the model back out and reports what it found, so an assertion can be about behaviour. */
function Probe(props: { readonly seen?: (model: StudioModel) => void }) {
  const model = useStudioModel()
  props.seen?.(model)
  return <output>{String(model.deps.now?.())}</output>
}

// The suite runs without vitest globals, so `@testing-library/react` never registers its own
// auto-cleanup and a second `render` would leave the first tree in the document.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('StudioModelProvider', () => {
  it('hands the subtree the exact model instance it was given', () => {
    const model = reatomStudio(DEPS)
    let seen: StudioModel | undefined

    render(
      <StudioModelProvider model={model}>
        <Probe
          seen={(read) => {
            seen = read
          }}
        />
      </StudioModelProvider>,
    )

    expect(seen).toBe(model)
  })

  it('carries the injected clock through to the reader, rather than Date.now', () => {
    render(
      <StudioModelProvider model={reatomStudio(DEPS)}>
        <Probe />
      </StudioModelProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('1700000000000')
  })
})

describe('useStudioModel', () => {
  it('is a developer error outside a provider', () => {
    // React reports a render-phase throw to the console before it propagates; the assertion is
    // about the throw, so the report is silenced rather than left to look like a failing test.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow(/StudioModelProvider/)
  })
})
