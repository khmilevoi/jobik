import * as jobik from '@jobik/core'
import {
  describeFlow,
  type SafeFlowDescriptor,
  type SafeFlowSummary,
  summariseFlow,
} from './descriptor.js'
import type { DiscoveredFlow, FlowRegistry } from './discovery.js'

/**
 * The four non-run operations, with no transport in sight: `routes.ts` is the only thing that knows
 * about HTTP, and `wireError.ts` is the only thing that knows about the browser.
 *
 * Everything here returns `T | Error` — these are the expected failures of a request, unlike the
 * author errors `config.ts` and `discovery.ts` throw at startup.
 *
 * Nothing here parses, migrates, hashes or writes a document itself: P3 owns all four primitives,
 * and P5 owns graph validation. This module is the wiring between them.
 */

export type LoadedFlow = {
  readonly descriptor: SafeFlowDescriptor
  readonly document: jobik.FlowDocument
  /** The revision of the exact bytes the document was read from. */
  readonly revision: string
}

export type DraftValidation =
  | { readonly valid: true; readonly document: jobik.FlowDocument }
  | { readonly valid: false; readonly error: jobik.JobikError }

export type SavedFlow = { readonly revision: string }

/** The design's `Flows` list, in config order. */
export function listFlows(registry: FlowRegistry): readonly SafeFlowSummary[] {
  return registry.flows.map(summariseFlow)
}

/** Descriptor, document and revision for one flow, or the first failure as a value. */
export async function loadFlow(discovered: DiscoveredFlow): Promise<LoadedFlow | jobik.JobikError> {
  const file = await jobik.readFlowDocument({ path: discovered.documentPath })
  if (file instanceof Error) return file
  const descriptor = describeFlow(discovered)
  if (descriptor instanceof Error) return descriptor
  return { descriptor, document: file.document, revision: file.revision }
}

/**
 * Validate a draft the editor holds in memory.
 *
 * Two steps, both borrowed: P3's `parseFlowDocument` decides whether the draft is a jobik.flow
 * document at all, and P5's `validateFlowGraph` decides whether it binds to this flow's code. There
 * is no third check here — a second validator would be a second definition of "valid".
 *
 * `path` is passed only so the borrowed errors carry one; the wire serialiser strips it.
 */
export function validateDraft(args: { flow: DiscoveredFlow; draft: unknown }): DraftValidation {
  const document = jobik.parseFlowDocument({
    path: args.flow.documentPath,
    value: args.draft,
  })
  if (document instanceof Error) return { valid: false, error: document }

  const graph = jobik.validateFlowGraph({ flow: args.flow.flow, document })
  if (graph instanceof Error) return { valid: false, error: graph }

  return { valid: true, document }
}

/**
 * Validate, check the revision, then write atomically.
 *
 * The order matters. An invalid draft never reaches the disk, so a document on disk is always one
 * that binds. The revision is re-read immediately before the write: this is a check-then-act and a
 * change landing in that window is not detected, which is the same guarantee the spec asks for —
 * "atomic save with the document revision hash", not a lock.
 *
 * The returned revision is the hash of the text just written. `revisionOf` hashes a string and its
 * utf-8 bytes alike, so it equals what a re-read would produce; no second read is needed.
 */
export async function saveFlow(args: {
  flow: DiscoveredFlow
  draft: unknown
  expectedRevision: string
}): Promise<SavedFlow | jobik.JobikError> {
  const validated = validateDraft({ flow: args.flow, draft: args.draft })
  if (!validated.valid) return validated.error

  const actualRevision = await jobik.readFlowRevision({ path: args.flow.documentPath })
  if (actualRevision instanceof Error) return actualRevision
  if (actualRevision !== args.expectedRevision) {
    return new jobik.FlowRevisionConflictError({
      path: args.flow.documentPath,
      expectedRevision: args.expectedRevision,
      actualRevision,
    })
  }

  const contents = jobik.serializeFlowDocument(validated.document)
  const failure = await jobik.writeFileAtomic({ path: args.flow.documentPath, contents })
  if (failure !== undefined) return failure

  return { revision: jobik.revisionOf(contents) }
}
