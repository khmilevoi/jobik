/**
 * Run-panel-only design values, transcribed from `Jobik Studio.dc.html`.
 *
 * P4's `tokens.ts` owns everything the Studio shares. This file owns only what the run-panel
 * artboards add and nothing else defines. **Never re-declare a value `tokens.ts` already carries —
 * import it.** Every entry below names the artboard and file line it came from.
 *
 * Several values here also appear in P7's `canvasTokens.ts`, because the same colour is used on
 * the canvas and in the dock. They are declared again rather than imported so neither token file
 * becomes a shared layer for the other; `runPanelTokens.test.ts` asserts the two sets agree. The
 * three a *third* directory reads — `actionLabel`, `spinnerTrack` and the load-bearing
 * `failedMeta` — are gone from here and live in `tokens.ts`: a custom property exists only while
 * its stylesheet is on the page, and `shell/RunDock` must not need a `run/` component mounted to
 * keep the one colour that marks a failed run.
 */
import { surfaces } from '../tokens.js'

/** `Run panel — states` running (line 787): the lit band that sweeps the skeleton. */
const skeletonHighlight = '#161a1d'

export const runPanelColors = {
  /** `Studio — default` idle (275) and `Run panel — states` running (781): the explanatory line. */
  note: '#767e85',
  /** `Studio — default` idle (283): the single-line control's value text. */
  controlValue: '#d5dade',
  /** `Studio — run in progress` (603) and `Run panel — states` (780): the 3px bar's track. */
  progressTrack: '#16191c',
  /** `Studio — run in progress` (609): the accent-tinted active node row's border. */
  activeRowBorder: 'rgba(31,214,189,.18)',
  /** `Studio — run in progress` (616): a queued node row's hollow dot. */
  queuedDotBorder: '#34393d',
  /** `Studio — run in progress` (617): a queued node row's name; also a `skipped` name. */
  queuedNodeName: '#6d757c',
  /** `Studio — default` idle (309): a `Last run` node name. */
  lastRunNodeName: '#636c73',

  skeletonHighlight,
  /** `Run panel — states` running (787): the partial-output shimmer. */
  skeleton:
    `linear-gradient(100deg,${surfaces.imagePlaceholder} 30%,` +
    `${skeletonHighlight} 50%,${surfaces.imagePlaceholder} 70%)`,

  /** `Run panel — states` failed (795, 796): the card frame and its header divider. */
  failedFrame: '#241b1a',
  /** `Run panel — states` failed (796): the header wash. `.05` here, not the node card's `.06`. */
  failedHeaderWash: 'rgba(201,106,92,.05)',
  /** `Run panel — states` failed (799): the header title. */
  failedTitle: '#f0e6e4',
  /** `Run panel — states` failed (804): the error well's border. */
  errorWellBorder: '#2a1f1e',
} as const

export const runPanelMetrics = {
  /** `Run panel — states` (771): the isolated card. The dock's own width is `layout.rightDockWidth`. */
  cardWidth: 320,
  cardHeight: 430,
  /** The card body's own padding and gap. `RunDock` supplies `16px 14px` / `16px` in the dock. */
  cardBodyPadding: '16px 14px',
  cardBodyGap: 14,

  progressBarHeight: 3,
  spinnerSize: 9,
  spinnerBorderWidth: 1.5,
  /** The 5px round status dot; and the 6px square dot in a state header. */
  statusDotSize: 5,
  squareDotSize: 6,

  /** `Studio — run in progress` (607–620): the 30px node rows. */
  nodeRowHeight: 30,
  nodeRowPaddingX: 8,
  nodeRowGap: 2,
  /** `Run panel — states` (782, 810, 838): the compact timings list. */
  timingRowGap: 6,

  /** `Studio — default` idle (290): the monospace `markdown` area. */
  markdownAreaHeight: 118,
  wellPaddingBlock: '10px',
  wellPaddingText: '8px 10px',
  wellPaddingError: '11px',

  /** `Run panel — states` running (786–788): the partial-output well. */
  partialMediaHeight: 70,
  partialCaptionHeight: 9,
  partialCaptionWidth: '70%',
  skeletonBackgroundSize: '220% 100%',

  /** `Run panel — states` completed (846): the output thumbnail. */
  thumbnailSize: 54,
  outputRowGap: 9,

  /** `Cancel run`, `Copy log`, `Re-run`, `Run start1`. */
  actionHeight: 34,

  /** `Studio — run in progress` (634–640): the live log. */
  logLineGap: 5,
  caretWidth: 3,
  caretHeight: 9,
} as const
