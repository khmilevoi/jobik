/**
 * Canvas-only design values, transcribed from `Jobik Studio.dc.html`.
 *
 * P4's `tokens.ts` owns everything the Studio shares. This file owns only what
 * the three canvas artboards add and nothing else defines. **Never re-declare a
 * value `tokens.ts` already carries — import it.** Every entry below names the
 * artboard it came from.
 */
import { motion, surfaces } from '#tokens.js'

/** `Node states` → running: the lit band that sweeps across the skeleton. */
const skeletonHighlight = '#161a1d'

export const canvasColors = {
  /** `Studio — default`: the canvas dot grid. The cached card's header divider
   *  is the same value. */
  dotGrid: '#191c1f',
  cachedHeaderDivider: '#191c1f',

  /** Edges: `Studio — default` idle, `Studio — run in progress` waiting. */
  edgeIdle: '#2c3236',
  edgeWaiting: '#23272b',

  /** Field handles: the fill, plus the two non-accent border tones. */
  handleFill: '#0b0c0d',
  handleIdle: '#3a4045',
  handleDim: '#2b3034',

  /** Running treatment: the 2px progress bar track. The spinner's unlit ring is
   *  `accent.spinnerTrack` — `run` and `studio` draw the same ring. */
  progressTrack: '#16191c',

  /** The 1.5s skeleton shimmer, over `surfaces.imagePlaceholder`. */
  skeletonHighlight,
  skeleton:
    `linear-gradient(100deg,${surfaces.imagePlaceholder} 30%,` +
    `${skeletonHighlight} 50%,${surfaces.imagePlaceholder} 70%)`,

  /** The 45° striped image placeholder. */
  stripeBase: '#0e1113',
  stripeLine: '#14181a',

  /** `Node states` → queued: the three flat placeholder bars. */
  placeholderBar: '#141719',

  /** The bottom-left zoom control chrome. */
  zoomControlBorder: '#202327',

  /** `2A`: the slot caption's `inspect` action is an accent inline link, and every accent inline
   *  link in the file swaps to this on hover (`01-foundations` §6.4 — `style-hover`, instantaneous,
   *  the design fixes no transition anywhere). `tokens.ts` carries no accent hover step yet; this
   *  is the canvas's copy of a value that belongs beside `accent.base`. */

  /** Node titles the shell's text ramp does not reach. */
  titleSelected: '#eef1f3',
  titleFailed: '#f0e6e4',
  titleCached: '#b3b9be',

  /** Dimmed field rows on queued and pending nodes. */
  fieldLabelDim: '#6d757c',
  annotationDim: '#4a5157',

  /** `3D` invalid board — the label of the port that actually mismatches, one step above
   *  `textColors.fieldLabel`. The artboard's only new text colour. */
  fieldLabelProblem: '#e2d3d0',
  /** `3D` invalid board — the dashed border on the card that cannot run. The failure ramp's `.4`
   *  step, which no canvas value carried before: the failed card's own border is `.45`. */
  blockedBorder: 'rgba(201,106,92,.4)',

  /** `### Selection and hover`: the section-label step a selected card lifts to, beside the
   *  title's own lift. */
  sectionLabelSelected: '#535a60',

  /* The inline output slot's caption, metadata row and separators are
   * `textColors.slotCaption`, `.metadata` and `.metadataSeparator` — the output
   * viewer draws the same three, so `tokens.ts` owns them. */

  /** `Node states` → failed. */
  failedBorder: 'rgba(201,106,92,.45)',
  failedHalo: '0 0 0 3px rgba(201,106,92,.05)',
  failedHeaderWash: 'rgba(201,106,92,.06)',
  failedHeaderDivider: '#241b1a',
  failedWellBorder: '#2a1f1e',
  failedActionBorder: '#332725',
  failedActionLabel: '#cfc4c1',
  failedSolidLabel: '#1a0d0b',
} as const

export const canvasMetrics = {
  dotGridGap: 22,
  dotRadius: 1,
  dotGridOffset: -1,

  handleSize: 8,
  handleBorderWidth: 1.5,
  handleOffset: -4,

  edgeStrokeWidth: 1.3,
  edgeActiveStrokeWidth: 1.4,
  /** `3D` — a failing edge is drawn at 1.4, not the 1.3 an accent edge takes. The only stroke
   *  weight the artboard changes, and it matches the active edge's own weight. */
  edgeErrorStrokeWidth: 1.4,
  edgeActiveDash: '5 7',
  edgeWaitingDash: '3 5',
  /** `### Edges` → stepped: two edges running between the same pair of nodes stagger their elbow
   *  so their vertical segments never sit on top of each other — the artboard turns at `336` then
   *  `352`, and at `744` then `760`. */
  steppedElbowStagger: 16,

  cardPaddingX: 12,
  /** The card radius is 7; the header sits inside a 1px border, so its own
   *  radius is 6. */
  headerRadius: 6,
  progressBarHeight: 2,
  kindDotSize: 6,
  statusDotSize: 5,
  cachedOpacity: 0.55,

  /** `### Layout and metrics`: 230 start, 316 with an inline output slot, 236
   *  plain. */
  nodeWidth: { start: 230, withSlot: 316, plain: 236 },

  outputSlotGutter: 10,
  outputSlotHeight: 180,
  outputSlotMediaHeight: 140,
  outputSlotCaptionHeight: 18,

  stateBodyPadding: 12,
  stateMediaHeight: 96,
  placeholderBarHeight: 6,

  skeletonBackgroundSize: '220% 100%',
  /** P4 owns the shimmer timing; this is a reference, not a copy. */
  skeletonAnimation: motion.shimmer,

  zoomButtonSize: 26,
  zoomControlsInset: { left: 20, bottom: 16 },
} as const
