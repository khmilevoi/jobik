---
'@jobik/core': minor
'@jobik/ui': minor
---

The Studio is brought up to the approved design, which has grown from six artboards to ten.

Four of the ten specify UI the implementation never had — `3A`/`3B` (buttons), `3C` (modals) and
`2A` (the full-page Studio with the output open) — and where a newer artboard disagrees with an
older one, the newer wins.

**The output moved out of an overlay and into a dock.** `2A` places it along the bottom of the
canvas column as a sibling of the canvas, so it displaces rather than covers: the flows sidebar and
the run dock keep their full height beside it. `OutputDock` is the new component — `Preview` / `Raw`
/ `Logs` tabs, a mono context line, `Copy all`, `Download`, a drag handle, and both `esc` and `×` to
close. It is opened from a settled node card's own accent `inspect`, which replaces the producing
node's name in the slot's caption row.

**The run panel now says what `2A` says.** A completed run shows the node timings, the inputs still
shown and still editable, `Re-run <entry> ⌘↵`, and a `Log` / `tail` block. Its `Outputs` section is
gone from the docked panel, because the outputs are in the dock; the section itself stays for the
standalone `Run panel — states` card, behind an optional prop.

**Four dialogs exist** — `ValidationModal`, `DownloadModal`, `StackTraceModal`, `CancelRunModal`,
composed from a shared `ModalShell` that is a real `<dialog>` with focus trapping. Cancelling a run
now asks first, from every affordance that used to cancel outright.

**The button system is rebuilt to `3A`.** `Button` keeps its `(variant, size)` axis and gains a
`panel` cell, plus `state`, `progress`, `meta`, `icon`, `reserveWidth` and `3B`'s `dimmed`. New
primitives: `Spinner`, `IconButton`, `InlineAction`, `ValueRow`, `ProgressTrack`, `Checkbox`,
`Toggle`, `SegmentedControl`, four icons, and the copy/download state machines that carry the
design's own timings.

**Elsewhere:** the top bar carries `2A`'s run pill while the dock is open and renders both save
tones; the left sidebar gains `Run history`; the run dock header becomes `● Completed` / `● Run
failed`; settled node cards print `● ok · 2.1s`; the dot grid is drawn at the design's real weight;
and the scrollbar is themed Studio-wide from a new `scrollbar` token group.

**`@jobik/core`, one addition.** A `string` control descriptor can now carry `multiline`, derived
from `z.string().meta({ multiline: true })`. The Studio's run panel needed a way to know that a
field wants a multi-line editor *before* anything has been typed into it; deriving it from the
draft's content, as it did, can never be right on first render. Purely additive.

**Accessibility, one deliberate departure from the design.** The design file has no
`prefers-reduced-motion` block. `globalStyles.css` adds one: under `reduce` the shimmer, pulse and
edge-dash loops are turned off by redefining their tokens, while the spinner keeps running, since it
is the only signal that a run is in progress.
