---
'@jobik/core': patch
'@jobik/ui': patch
---

Six defects. None of them is a missing feature — every one was code that already claimed to work.

**A save could fail outright and leave the old bytes on disk.** Windows cannot rename over a file
another handle holds open: libuv does not open with `FILE_SHARE_DELETE`, so `MoveFileExW` answers
`EPERM` and the *old* document survives. The document has readers — `readFlowDocument` runs at the
head of every run — and the retry budget was ~150ms over five attempts, roughly three polls of a
50ms reader. On a loaded machine every attempt could meet an open handle and the save failed. The
budget is now ~1.5s over eleven attempts, spaced so the common case still costs nothing, and a
refusal that can never pass on its own — the target is a directory, or is not writable — is
recognised and not retried at all. This is what made the repository gate's drag-and-save case fail
intermittently while the same test passed in isolation.

**A successful write now fsyncs the containing directory, and sweeps its own orphans.** A crash
between writing the temporary and renaming it used to leave that temporary beside the document
forever. The sweep is deliberately narrow: only names matching this document's own temporary shape,
only ones older than an hour, never a write in flight. The directory fsync is a no-op on Windows,
which has no such call and has already committed the entry at `MoveFileEx`.

**`asset()` typed `Buffer` and let a `Uint8Array` through unconverted.** A caller obeying the type
was fine; a caller handing over the `Uint8Array` that every Web API returns got one back, and
`Buffer`-only methods failed downstream. Normalised with `.overwrite()` rather than a `transform`,
because a `ZodPipe` around the schema would change what `z.toJSONSchema` walks. The trap, since it
cost a debugging session: `.overwrite()` returns a **clone**, and JSON Schema conversion visits the
custom field once per instance — registering only the clone made every asset field in the repository
fail to derive. Both instances are registered.

**`registerAsset` stored the caller's `Buffer` by reference.** A handler that reused its own buffer
after handing it over changed the bytes the run had already reported. The store copies
unconditionally now; a run's assets are the bytes as they were at `registerAsset`.

**Concurrent runs were numbered in the order they finished, not the order they were started.** The
number was claimed after the document read and the input validation, so two runs started together
came back labelled by whichever finished first. It is claimed when the request arrives. A run
rejected before it reaches the engine gives its number back — but only while it is still the highest
number handed out, because returning a lower one would either reuse a number a live run carries or
hand a later run a smaller number than an earlier one. So a rejection that overlaps a concurrent run
leaves a gap in the history, and a rejection on an idle flow — an empty required field, the case a
user actually meets — leaves none.

**The number control dropped the schema's bounds.** `min` and `max` are forwarded to the `<input>`,
so a `z.number().min(1).max(10)` field is bounded in the browser as well as in validation. Two
consequences worth stating: `z.number().int()` carries the ±2^53−1 safe-integer bounds, so those now
appear as attributes — correct, if startling to read; and `.gt()` / `.lt()` still bound nothing,
because Zod converts them to `exclusiveMinimum` / `exclusiveMaximum`, which the descriptor does not
carry and HTML `min` / `max` cannot express.

**The cancel dialog stated a guarantee the engine does not have, and no longer does.** This is a
deliberate departure from the approved design's copy. That copy promises the in-flight node finishes
its current work and that completed nodes stay cached so a re-run resumes from there; in v1 the run
settles on `Promise.race([invoked, aborted])` without waiting for the handler, and there is no
caching — every reachable node executes again. The dialog is the one place a user is told what
cancelling costs, so it now says that: the node is asked to stop, the run settles at once, nothing
is kept, and a re-run starts from the beginning.
