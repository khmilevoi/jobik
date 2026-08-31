---
'@jobik/core': minor
'@jobik/ui': minor
---

Three things the design fixes that the implementation had recorded as gaps.

**A flow can now declare what the graph cannot say.** `flow().meta({ … })` is an open, run-time
inert bag on the builder, callable anywhere in the chain and mergeable. Its one field today is
`source` — the module the flow is authored in, `import.meta.filename`, absolute for the same reason
`bind('path', …)` is.

**The top bar's file badge names the right file.** It printed `flow.jobik.json`, the document; every
artboard prints `flow.ts`, the TypeScript source the flow is written in — and `3C`'s validation
findings cite `flow.ts:41`, so the badge and the findings have to agree. `SafeFlowDescriptor` and
the wire now carry `sourceFile` beside `documentFile`: the basename of the author's own
`meta({ source })`, falling back to the binding entrypoint's own file name. Basename only, never a
directory, exactly as `documentFile` already was.

**`Run history` became a navigator.** The sidebar listed this browser session's runs and no row did
anything, because nothing kept an earlier run's report. `StudioApp` now archives every settled
`RunSession`, and picking a row restores that run's canvas overlays, run panel, output dock and log
— every one of those was already a projection of a session, so keeping the session is the whole
feature. Nothing is fetched: v1 still has no endpoint that returns an earlier run, so the archive
lives exactly as long as the tab. While a run is in flight the rows carry no select handler, since
the live run has no row of its own to come back from.

**`Retry node` works, and `3B`'s `retrying` state is real.** The card's flag had no producer.
Pressing `Retry node` now starts the run `Re-run` starts — the only re-execution the engine has —
and for as long as that run is in flight the retried card keeps the error well it failed with, both
footer actions dimmed, under `3B`'s header: the spinner in place of the kind dot and `retrying` in
the accent. `retrying` joins `NodeRunState` as its seventh member, with its own card rule.

Wiring the button turned up a bug in the card it sits on: neither `View trace` nor `Retry node`
carried React Flow's `nodrag` opt-out, so pressing either one also started dragging the node
underneath it. Both carry it now, as `NodeOutputSlot`'s `inspect` already did.
