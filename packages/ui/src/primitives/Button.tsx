import type { CSSProperties, ReactNode } from 'react'
import {
  accent,
  borders,
  fontFamilies,
  fontWeights,
  px,
  radii,
  surfaces,
  textColors,
  tracking,
} from '../tokens.js'

export type ButtonVariant = 'quiet' | 'outlined' | 'accent'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonCommonProps {
  readonly children: ReactNode
  /** The mono keyboard hint the accent/lg cell carries. Renders only when supplied. */
  readonly hint?: ReactNode
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly 'aria-label'?: string
  readonly 'data-testid'?: string
}

/**
 * Only the seven (variant, size) cells the artboards contain are typed. A plan that needs an
 * eighth reports it as a gap rather than inventing its metrics.
 */
export type ButtonProps =
  | (ButtonCommonProps & { readonly variant: 'quiet'; readonly size: 'sm' | 'md' | 'lg' })
  | (ButtonCommonProps & { readonly variant: 'outlined'; readonly size: 'md' | 'lg' })
  | (ButtonCommonProps & { readonly variant: 'accent'; readonly size: 'xs' | 'lg' })

const base: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontFamily: fontFamilies.ui,
  fontWeight: fontWeights.regular,
  background: 'none',
}

const cells: Record<string, CSSProperties> = {
  'quiet:sm': {
    height: px(24),
    padding: '0 8px',
    borderRadius: px(radii.small),
    border: `1px solid ${borders.control}`,
    fontSize: px(11),
    color: textColors.controlLabel,
  },
  'quiet:md': {
    height: px(26),
    padding: '0 10px',
    borderRadius: px(radii.small),
    border: `1px solid ${borders.control}`,
    fontSize: px(11.5),
    color: textColors.controlLabel,
  },
  'quiet:lg': {
    padding: '6px 12px',
    borderRadius: px(radii.control),
    border: `1px solid ${borders.control}`,
    fontSize: px(12),
    color: textColors.controlLabel,
  },
  'outlined:md': {
    height: px(26),
    padding: '0 10px',
    borderRadius: px(radii.small),
    border: `1px solid ${borders.saveButton}`,
    background: surfaces.saveFill,
    fontSize: px(11.5),
    color: textColors.primary,
  },
  'outlined:lg': {
    padding: '6px 14px',
    borderRadius: px(radii.control),
    border: `1px solid ${borders.saveButton}`,
    background: surfaces.saveFill,
    fontSize: px(12),
    fontWeight: fontWeights.medium,
    color: textColors.primary,
  },
  'accent:xs': {
    height: px(20),
    padding: '0 8px',
    borderRadius: px(radii.badge),
    border: 'none',
    background: accent.cssVar,
    fontSize: px(11),
    fontWeight: fontWeights.semibold,
    color: accent.onFill,
  },
  'accent:lg': {
    height: px(34),
    justifyContent: 'center',
    gap: px(8),
    borderRadius: px(radii.control),
    border: 'none',
    background: accent.cssVar,
    fontSize: px(12.5),
    fontWeight: fontWeights.semibold,
    color: accent.onFill,
    letterSpacing: tracking.wide,
  },
}

export function Button(props: ButtonProps) {
  const { variant, size, children, hint, onClick, disabled } = props
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={props['aria-label']}
      data-testid={props['data-testid']}
      style={{ ...base, ...cells[`${variant}:${size}`] }}
    >
      {children}
      {hint === undefined ? null : (
        <span
          style={{ fontFamily: fontFamilies.mono, fontSize: px(10), color: accent.onFillMuted }}
        >
          {hint}
        </span>
      )}
    </button>
  )
}
