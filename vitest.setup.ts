import '@testing-library/jest-dom/vitest'

/**
 * React Flow measures every node through `ResizeObserver` and reads the result from `offsetWidth` /
 * `offsetHeight`. jsdom implements none of that, and a no-op observer leaves every node unmeasured,
 * which silently removes every edge from the DOM. This is the shim React Flow's own testing guide
 * prescribes (reactflow.dev/learn/advanced-use/testing).
 *
 * `observe` fires on a macrotask, so tests asserting on edges or measured geometry must `waitFor`.
 */
class ResizeObserverMock implements ResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    setTimeout(() => {
      const element = target as HTMLElement
      // @xyflow/system's pane-extent observer callback reads entry.contentRect.width/.height
      // unguarded
      const contentRect = new DOMRectReadOnly(0, 0, element.offsetWidth, element.offsetHeight)
      this.callback([{ target, contentRect } as ResizeObserverEntry], this)
    }, 0)
  }

  unobserve(): void {}
  disconnect(): void {}
}

class DOMMatrixReadOnlyMock {
  readonly m22: number

  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1]
    this.m22 = scale === undefined ? 1 : Number.parseFloat(scale)
  }
}

if (typeof document !== 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock
  ;(globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnlyMock

  Object.defineProperties(globalThis.HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.height) || 1
      },
    },
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.width) || 1
      },
    },
  })

  Object.defineProperty(globalThis.SVGElement.prototype, 'getBBox', {
    configurable: true,
    writable: true,
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect,
  })
}
