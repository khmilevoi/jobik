import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STUDIO_GLOBAL_CSS, StudioStyles } from './globalStyles.js'

describe('STUDIO_GLOBAL_CSS', () => {
  it('declares the four motion loops the design uses', () => {
    expect(STUDIO_GLOBAL_CSS).toContain('@keyframes jspin{to{transform:rotate(360deg)}}')
    expect(STUDIO_GLOBAL_CSS).toContain('@keyframes jdash{to{stroke-dashoffset:-24}}')
    expect(STUDIO_GLOBAL_CSS).toContain(
      '@keyframes jshim{0%{background-position:130% 0}100%{background-position:-30% 0}}',
    )
    expect(STUDIO_GLOBAL_CSS).toContain('@keyframes jpulse{0%,100%{opacity:.4}50%{opacity:1}}')
  })

  it('scopes the box-sizing reset to the Studio', () => {
    expect(STUDIO_GLOBAL_CSS).toContain('[data-jobik-studio],[data-jobik-studio] *')
    expect(STUDIO_GLOBAL_CSS).toContain('box-sizing:border-box')
  })

  it('resets the button font family without touching its line height', () => {
    expect(STUDIO_GLOBAL_CSS).toContain('[data-jobik-studio] button')
    expect(STUDIO_GLOBAL_CSS).toContain('font-family:inherit')
    expect(STUDIO_GLOBAL_CSS).not.toContain('line-height')
  })
})

describe('StudioStyles', () => {
  it('renders the css into a single style element', () => {
    const { container } = render(<StudioStyles />)
    const styles = container.querySelectorAll('style[data-jobik-styles]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe(STUDIO_GLOBAL_CSS)
  })
})
