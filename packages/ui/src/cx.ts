/**
 * The class-name joiner every migrated component uses.
 *
 * Variants used to be objects spread into `style`; they are now conditional class lists, and this
 * is the three lines that turn one into a string. `clsx` would do the same thing, but it would
 * also be the first runtime dependency `@jobik/ui` takes on for the browser bundle, and the
 * object/array forms it adds are not forms this codebase needs — a variant resolver returns a
 * class name or nothing.
 *
 * `false | null | undefined` are dropped, so `cx(s.chip, tone === 'accent' && s.accent)` reads the
 * way the condition reads. `undefined` is deliberately allowed: a mistyped CSS Modules key is
 * `undefined` at runtime, and swallowing it here keeps `className="undefined"` out of the DOM.
 * The typo itself is caught by `cssModuleUsage.test.ts`, which compares every `s.name` a component
 * reads against the classes its stylesheet defines.
 */
import type { CSSProperties } from 'react'

export type ClassValue = string | false | null | undefined

export function cx(...values: readonly ClassValue[]): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ')
}

/**
 * The only `style` a migrated component is allowed to build: custom properties for the values that
 * are genuinely dynamic — a caller-supplied colour, a progress width, a canvas transform. The rule
 * lives in the `*.module.css`, which reads `var(--jbk-thing, <default>)`; this is the type that
 * lets React accept the property name. `StudioFrame` already sets `--accent` this way.
 */
export type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>
