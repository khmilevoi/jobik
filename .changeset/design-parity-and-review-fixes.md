---
'@jobik/ui': minor
---

The Studio catches up with the design's motion spec (`4A`) and closes out the review findings this
branch itself turned up. One breaking change for anyone authoring against the model layer directly.

**`ToastModel.dismiss` is removed.** It was documented as "what a flow switch calls" but had no
caller — a standing toast now finishes its own hold on a flow switch instead of being cut short, and
its teardown moved into the surface's own connect hook. Drop any call to it; there is nothing to
replace it with, because there is no longer a dismissal to perform.

**Two status unions widened**, both `satisfies`-checked so a new wire value is a compile error
rather than a silent fallback: `RunDockStatus` (`shell`) gains `running`, so the run dock's header
holds one shape for the whole run instead of switching identity partway through. `RunSummary['status']`
(`run`) gains `cancelled`, so the idle panel's "Last run" block — and the run history row and toast
beside it — say `cancelled` for a run the user stopped themselves, rather than misreporting it as
`failed`.

**Elsewhere, mostly motion.** Node cards, the tab marker, side panels, the output dock, run-history
rows and the flow canvas now carry the transitions `4A` specifies — 140ms state changes, 180ms
layout, 240ms flow switches, the dashed-edge march — all zeroed under `prefers-reduced-motion` except
the spinner. The toast (`F-C13`) is new. A run archived by flow switch, a node the engine never ran
no longer painted as a success, and a handful of stale doc comments are also fixed.
