/**
 * Artboard `3C` values, transcribed from `Jobik Studio.dc.html` via `09-modals.md`.
 *
 * `tokens.ts` owns everything the Studio shares and `primitives/primitiveTokens.ts` owns what the
 * `3A`/`3B` button system adds — including every `3C` control chrome the buttons, the checkbox,
 * the toggle and the segmented control need. This file owns only what the modal *shell and its
 * findings* add on top of both. **Never re-declare a value another layer carries — import it.**
 *
 * So the card reads `--jbk-surface-top-bar` / `--jbk-border-control` / `--jbk-radius-panel`, the
 * header and footer rules read `--jbk-border-shell-divider`, the footer ground reads
 * `--jbk-surface-panel`, the error finding's ground reads `--jbk-surface-failed-error-well` and
 * its tag `--jbk-status-error-tag`, the count badges read `--jbk-primitive-failed-*`, and the
 * `Copied` confirmation reads `--jbk-primitive-ok-*`. Five colours and one radius are left over.
 *
 * Every entry names the `09-modals.md` section it came from.
 */

export const modalColors = {
  /**
   * §1.1, rule 01 — the scrim, `rgba(5,5,6,.72)` with **no blur**. It is `surfaces.page` at `.72`,
   * the same value `outputColors.badgeScrim` carries for the output dock's `n / m` badge; a custom
   * property exists only while its own stylesheet is on the page, so a modal cannot read that one.
   */
  backdrop: 'rgba(5,5,6,.72)',
  /** §1.2 — the card's one drop shadow. No other layer carries a shadow at all. */
  cardShadow: '0 24px 60px rgba(0,0,0,.6)',
  /**
   * §2 — the error finding's hairline, and the same on the stack trace's error summary block.
   * `canvasColors.failedWellBorder` and `runPanelColors.errorWellBorder` are this value on their
   * own surfaces; a third copy is what a per-directory token pair costs.
   */
  errorFindingBorder: '#2a1f1e',
  // §2's warning tag — the finding's mono class name and the `1 warning` badge's label — is
  // `statusColors.warningTag`: `shell/ProblemsStrip` reads the same value, so it is shared.
  /** §2 — the `1 warning` badge's hairline. Border only, no fill: one step quieter than the error badge. */
  warningBadgeBorder: '#2a2721',
} as const

export const modalMetrics = {
  /**
   * §2 — a finding card, the stack trace's error block and its frame list are all `6`. The shared
   * ramp runs `8/7/5/4/3/2` and carries no `6`; `outputMetrics.primaryImageRadius` is the same
   * gap, met the same way.
   */
  findingRadius: 6,
} as const
