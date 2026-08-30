/**
 * The two number formats the `Output viewer` artboard prints. Pure and locale-independent —
 * `toLocaleString` is not, and the design's separator is a plain space, not a comma.
 */

/** `654336` -> `654 336`. The artboard groups thousands with a plain space (design 944). */
export function groupDigits(value: number): string {
  const sign = value < 0 ? '-' : ''
  const [integer, fraction] = Math.abs(value).toString().split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`
}

/**
 * `421888` -> `412 kb`, `1434` -> `1.4 kb`, `640` -> `640 b`.
 *
 * The artboards print exactly four readouts — `412 kb`, `208 kb`, `34 kb` and `1.4 kb` — so
 * kilobytes carry one decimal below ten and none above. Nothing rolls over to `mb` in v1, because
 * no artboard shows one.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`
  const kb = bytes / 1024
  return kb < 10 ? `${kb.toFixed(1)} kb` : `${Math.round(kb)} kb`
}
