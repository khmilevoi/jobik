/**
 * Shell-only design values, transcribed from `Jobik Studio.dc.html`.
 *
 * `tokens.ts` owns everything the Studio shares; this file owns only what the shell adds and
 * nothing shared already carries. Today that is two things. The three colours a **failed** run
 * dock header needs: `Run panel — states` failed (design 795–799) is the dock's own header in that
 * state (`02-shell.md` §4.1 — the result form is "`2A`, `Studio — run in progress` when it reports
 * a run number, and every card on `Run panel — states`"). And the one fill `3E` adds under the
 * pointer, which no other directory draws.
 *
 * The same three values are in `run/runPanelTokens.ts`, and they are declared again here rather
 * than imported for exactly the reason that file gives about `canvas/canvasTokens.ts`: a custom
 * property exists only while its own stylesheet is on the page, so `shell/RunDock` reading a
 * `--jbk-run-…` property would be a silent dependency on some `run/` component being mounted — the
 * dependency the `failedMeta` promotion was made to remove. `shellTokens.test.ts` asserts the two
 * sets agree, the way `runPanelTokens.test.ts` does for canvas and run.
 */

export const shellColors = {
  /** `Run panel — states` failed (795, 796): the failed header's divider. */
  failedFrame: '#241b1a',
  /** `Run panel — states` failed (796): the failed header's wash. `.05`, not the card's `.06`. */
  failedHeaderWash: 'rgba(201,106,92,.05)',
  /** `Run panel — states` failed (799): the failed header's title. */
  failedTitle: '#f0e6e4',

  /**
   * `3E` candidate A, `Active + hover`: the fill the **selected** flow row takes under the
   * pointer, one step above the `#131518` it rests at. An unselected row's hover fill is not here
   * — `3E` names it as the fill `3A`'s h34 ghost panel button already uses, so
   * `FlowsSidebar.module.css` reads `--jbk-primitive-hover-fill-panel` rather than restating it.
   * This step is drawn nowhere else. `#16181a` is also `surfaces.saveFill`, which is a collision
   * on the ramp and not a shared value: `3E` names the one fill it reuses and does not name this.
   */
  activeFlowRowHover: '#16181a',

  /**
   * F-C13 — the toast, transcribed from the demo prototype (`.design/raw/demo.dc.html:318`), which
   * is the only place the design draws one. `4A`'s coverage grid fixes its motion and no artboard
   * of `Jobik Studio.dc.html` draws the surface, so these three are the prototype's own values and
   * are marked as such: a later artboard supersedes them, and nothing else in the package reads
   * them meanwhile.
   */
  toastSurface: '#101214',
  toastBorder: '#24282c',
  /**
   * The design's **only** shadow. Every artboard is flat, which is why no `tokens.ts` group holds
   * one; the prototype lifts the toast off the canvas it floats over, and that lift is the whole
   * reason a toast can sit on an unrelated surface without a container. It stays here rather than
   * in `tokens.ts` for the rule this file states above — one directory reads it.
   */
  toastShadow: '0 12px 30px rgba(0,0,0,.5)',

  // `3D` §3D.3's `No issues` and its warning code used to be spelled here as well. Both were read
  // by a second directory — `primitives` and `modals` respectively — so they were folded into
  // `statusColors.okLabel` and `statusColors.warningTag`, and `shell/*.module.css` now reads
  // `--jbk-status-ok-label` and `--jbk-status-warning-tag`. That is the rule this file follows:
  // a value one directory reads lives here, a value two directories read lives in `tokens.ts`.
} as const

/**
 * The shell's own measurements — one, so far.
 *
 * `border-radius` is one of the three closed sets a `*.module.css` may not spell literally, and
 * `tokens.ts`'s `radii` has no 6px step because no artboard draws one. The prototype's toast does
 * (`demo.dc.html:318`), so it is transcribed here rather than added to the shared ramp: minting a
 * global step for a surface the design file itself does not draw would put a value in `tokens.ts`
 * that nothing else can point at.
 */
export const shellMetrics = {
  /** `demo.dc.html:318` — `border-radius:6px` on the toast. */
  toastRadius: 6,
} as const
