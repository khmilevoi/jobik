import path from 'node:path'
import { afterEach } from 'vitest'
import {
  bindPublicationTo,
  createPublicationDocumentCopy,
  publicationFixture,
} from '../../../../examples/showcase/publication/fixtures.js'
import { defineJobikConfig } from './config.js'
import { type DiscoveredFlow, discoverFlows } from './discovery.js'

/**
 * Test-support module for server tests. Not exported from the barrel.
 *
 * Shared fixtures and helpers used across multiple test files (descriptor.test.ts,
 * flowService.test.ts, and httpServer.test.ts) to avoid duplication.
 */

export const uiPath = path.resolve(publicationFixture.root, 'flow.ui.tsx')

const cleanups: (() => Promise<void>)[] = []
let setupCleanupsCalled = false

export function setupCleanups() {
  setupCleanupsCalled = true
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })
}

/** Register a teardown function to be run in LIFO order in the same drain as `setupCleanups()`. */
export function pushCleanup(fn: () => void | Promise<void>): void {
  cleanups.push(async () => {
    await fn()
  })
}

/** A discovered flow bound to a throwaway copy of the example document. */
export async function temporaryFlow(): Promise<DiscoveredFlow> {
  if (!setupCleanupsCalled) {
    throw new Error(
      'temporaryFlow() requires setupCleanups() to have been called in this file to register the cleanup drain',
    )
  }
  const copy = await createPublicationDocumentCopy()
  cleanups.push(copy.cleanup)
  const flow = bindPublicationTo(copy.documentPath)
  return {
    id: flow.name,
    flow,
    bindingPath: publicationFixture.bindingPath,
    uiPath,
    documentPath: copy.documentPath,
    runHistory: { directory: path.join(path.dirname(copy.documentPath), '.jobik/runs') },
  }
}

/** Discover the committed publication flow from disk. */
export async function committedFlow(): Promise<DiscoveredFlow> {
  const registry = await discoverFlows({
    config: defineJobikConfig({
      flows: [{ binding: publicationFixture.bindingPath, ui: uiPath }],
    }),
  })
  return registry.flows[0]
}
