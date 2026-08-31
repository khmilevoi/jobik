import { Jimp, loadFont, measureText } from 'jimp'
import { SANS_16_BLACK, SANS_16_WHITE, SANS_32_BLACK, SANS_32_WHITE } from 'jimp/fonts'
import {
  POKEDEX_CARD_HEIGHT,
  POKEDEX_CARD_MIME,
  POKEDEX_CARD_WIDTH,
  POKEDEX_MAX_BASE_STAT,
  type PokedexStat,
  type PokedexTheme,
  typeColour,
} from '../types.js'

/**
 * The pokédex card, drawn with jimp.
 *
 * Everything here runs inside the handler on the server, so no bundler is involved and the bundled
 * Open Sans faces on jimp's `jimp/fonts` subpath are simply files on disk. The card is composed
 * rather than filled: a scanned vertical gradient derived from the primary type, a translucent
 * plate, the downloaded artwork scaled to fit and centred on it, two type chips, six proportional
 * stat bars and three runs of text.
 *
 * `compose.ts` owns the node; this file owns the pixels, so the drawing can be exercised on its
 * own and the node stays a schema plus five lines.
 */

/**
 * jimp 1.6 builds its class with `createJimp()`, so `Jimp` is a value with no type of its own.
 * `InstanceType` is how an image gets a name in a signature.
 */
type JimpImage = InstanceType<typeof Jimp>

/**
 * What `Jimp.read()` resolves to. Not the same type as `InstanceType<typeof Jimp>`: the decoder
 * entry points are typed from the format list rather than from the class, so a decoded image needs
 * its own alias to be nameable in a signature.
 */
type DecodedImage = Awaited<ReturnType<typeof Jimp.read>>

/** The geometry, named once so the drawing reads as a layout and the tests can assert it. */
const layout = {
  accentBarHeight: 6,
  plate: { x: 28, y: 44, size: 260 },
  artwork: { inset: 10, size: 240 },
  column: { x: 316 },
  number: { y: 52 },
  name: { y: 72 },
  chips: { y: 126, height: 26, gap: 8, padding: 12 },
  stats: { y: 176, rowHeight: 30, labelWidth: 76, barHeight: 10, trackEnd: 656, valueX: 664 },
  footer: { y: 380 },
} as const

/** A theme's fixed palette. `accent` always comes from the pokémon, never from the theme. */
type Palette = {
  readonly top: string
  readonly bottom: string
  readonly plate: string
  readonly plateAlpha: number
  readonly text: string
  readonly muted: string
  readonly track: string
  readonly trackAlpha: number
  readonly light: boolean
}

/**
 * The three themes the `card` start offers.
 *
 * `type` is the interesting one: its background is the primary type's colour mixed down towards
 * near-black, so an electric card is warm and a water card is cold without either being unreadable
 * under white text. `midnight` and `parchment` are fixed, and prove the type accent still lands.
 */
export function paletteFor(theme: PokedexTheme, accent: string): Palette {
  if (theme === 'parchment') {
    return {
      top: '#f6efdd',
      bottom: '#e4d9be',
      plate: '#000000',
      plateAlpha: 18,
      text: '#1b1a17',
      muted: '#6a6255',
      track: '#000000',
      trackAlpha: 32,
      light: true,
    }
  }
  if (theme === 'midnight') {
    return {
      top: '#161b23',
      bottom: '#0a0d12',
      plate: '#ffffff',
      plateAlpha: 16,
      text: '#f2f5f8',
      muted: '#8b96a5',
      track: '#ffffff',
      trackAlpha: 26,
      light: false,
    }
  }
  return {
    top: mix(accent, '#0b0d10', 0.62),
    bottom: mix(accent, '#0b0d10', 0.86),
    plate: '#ffffff',
    plateAlpha: 20,
    text: '#ffffff',
    muted: mix(accent, '#ffffff', 0.45),
    track: '#ffffff',
    trackAlpha: 30,
    light: false,
  }
}

/** `#rrggbb` to its three channels. Anything unparseable reads as black rather than throwing. */
function channels(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(value)) return [0, 0, 0]
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** `t` of the way from `from` to `to`, as `#rrggbb`. */
export function mix(from: string, to: string, t: number): string {
  const a = channels(from)
  const b = channels(to)
  const clamped = Math.min(1, Math.max(0, t))
  const blend = (index: 0 | 1 | 2) => Math.round(a[index] + (b[index] - a[index]) * clamped)
  return `#${[blend(0), blend(1), blend(2)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Perceived brightness, 0..1, weighted the way an eye reads the channels.
 *
 * A type chip is filled with the pokémon's own colour, so nothing about the theme can decide
 * whether its label should be white or black: electric and ice are nearly white, dragon and ghost
 * are nearly black, and one font for both is unreadable half the time.
 */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** jimp takes a packed `0xRRGGBBAA`. `>>> 0` keeps it unsigned once the top bit is set. */
function rgba(hex: string, alpha = 255): number {
  const [r, g, b] = channels(hex)
  return ((r << 24) | (g << 16) | (b << 8) | alpha) >>> 0
}

/** One filled rectangle, composited so a translucent fill actually blends with what is under it. */
function fill(image: JimpImage, x: number, y: number, w: number, h: number, colour: number): void {
  if (w <= 0 || h <= 0) return
  image.composite(new Jimp({ width: Math.round(w), height: Math.round(h), color: colour }), x, y)
}

/**
 * The four bundled faces this card uses, loaded once per process.
 *
 * `loadFont` reads a `.fnt` and its page bitmaps off disk every time it is called, which is far
 * too slow to repeat per run — and a flow node is expected to be run over and over from the run
 * panel.
 */
const fontCache = new Map<string, Promise<Awaited<ReturnType<typeof loadFont>>>>()

function font(file: string) {
  const cached = fontCache.get(file)
  if (cached !== undefined) return cached
  const loading = loadFont(file)
  fontCache.set(file, loading)
  return loading
}

/** Everything the card prints, already flattened by `compose`. */
export type CardSubject = {
  readonly displayName: string
  readonly number: number
  readonly primaryType: string
  readonly secondaryType: string
  readonly stats: readonly PokedexStat[]
  readonly theme: PokedexTheme
}

/** `#025`, the way the games print it. */
export function pokedexNumber(value: number): string {
  return `#${String(value).padStart(3, '0')}`
}

/** The caption `compose` emits beside the image, and the card's own footer line. */
export function captionFor(subject: CardSubject): string {
  const types = [subject.primaryType, subject.secondaryType].filter((name) => name.length > 0)
  const total = subject.stats.reduce((sum, stat) => sum + stat.base, 0)
  return `${pokedexNumber(subject.number)} ${subject.displayName} — ${types.join(' / ')} · ${total} BST`
}

/** Paint the vertical gradient, one interpolated row at a time. */
function paintBackground(card: JimpImage, palette: Palette): void {
  const top = channels(palette.top)
  const bottom = channels(palette.bottom)
  const lastRow = Math.max(1, POKEDEX_CARD_HEIGHT - 1)
  card.scan((_x: number, y: number, index: number) => {
    const t = y / lastRow
    card.bitmap.data[index] = Math.round(top[0] + (bottom[0] - top[0]) * t)
    card.bitmap.data[index + 1] = Math.round(top[1] + (bottom[1] - top[1]) * t)
    card.bitmap.data[index + 2] = Math.round(top[2] + (bottom[2] - top[2]) * t)
    card.bitmap.data[index + 3] = 0xff
  })
}

/** Scale the artwork to fit the plate without distorting it, and centre it there. */
function placeArtwork(card: JimpImage, artwork: DecodedImage): void {
  const box = layout.artwork.size
  const scale = Math.min(box / artwork.bitmap.width, box / artwork.bitmap.height)
  const w = Math.max(1, Math.round(artwork.bitmap.width * scale))
  const h = Math.max(1, Math.round(artwork.bitmap.height * scale))
  artwork.resize({ w, h })
  const originX = layout.plate.x + layout.artwork.inset + Math.round((box - w) / 2)
  const originY = layout.plate.y + layout.artwork.inset + Math.round((box - h) / 2)
  card.composite(artwork, originX, originY)
}

/** Above this the chip is light enough that its label has to be black. */
const CHIP_LIGHT_THRESHOLD = 0.65

/** The type chips, laid left to right from the right column, each in its own type colour. */
async function paintTypeChips(card: JimpImage, subject: CardSubject): Promise<void> {
  let x = layout.column.x
  for (const name of [subject.primaryType, subject.secondaryType]) {
    if (name.length === 0) continue
    const colour = typeColour(name)
    const chipFont = await font(
      luminance(colour) > CHIP_LIGHT_THRESHOLD ? SANS_16_BLACK : SANS_16_WHITE,
    )
    const label = name.toUpperCase()
    const width = measureText(chipFont, label) + layout.chips.padding * 2
    fill(card, x, layout.chips.y, width, layout.chips.height, rgba(colour))
    card.print({ font: chipFont, x: x + layout.chips.padding, y: layout.chips.y + 3, text: label })
    x += width + layout.chips.gap
  }
}

/** Six labelled bars, each proportional to the highest base stat in the games. */
async function paintStats(card: JimpImage, subject: CardSubject, palette: Palette): Promise<void> {
  const smallFont = await font(palette.light ? SANS_16_BLACK : SANS_16_WHITE)
  const trackX = layout.column.x + layout.stats.labelWidth
  const trackWidth = layout.stats.trackEnd - trackX
  const accent = typeColour(subject.primaryType)

  subject.stats.forEach((stat, index) => {
    const rowY = layout.stats.y + index * layout.stats.rowHeight
    const barY = rowY + 5
    card.print({ font: smallFont, x: layout.column.x, y: rowY, text: stat.label })
    fill(
      card,
      trackX,
      barY,
      trackWidth,
      layout.stats.barHeight,
      rgba(palette.track, palette.trackAlpha),
    )
    const ratio = Math.min(1, Math.max(0, stat.base / POKEDEX_MAX_BASE_STAT))
    fill(card, trackX, barY, Math.round(trackWidth * ratio), layout.stats.barHeight, rgba(accent))
    card.print({ font: smallFont, x: layout.stats.valueX, y: rowY, text: String(stat.base) })
  })
}

/** Render the card. `artworkPng` is whatever `sprite` downloaded; jimp decides if it decodes. */
export async function renderCard(args: {
  subject: CardSubject
  artworkPng: Buffer
}): Promise<Buffer> {
  const { subject } = args
  const accent = typeColour(subject.primaryType)
  const palette = paletteFor(subject.theme, accent)

  const card = new Jimp({
    width: POKEDEX_CARD_WIDTH,
    height: POKEDEX_CARD_HEIGHT,
    color: rgba(palette.top),
  })
  paintBackground(card, palette)

  // The two accent rules that frame the whole card, top and bottom.
  fill(card, 0, 0, POKEDEX_CARD_WIDTH, layout.accentBarHeight, rgba(accent))
  fill(
    card,
    0,
    POKEDEX_CARD_HEIGHT - layout.accentBarHeight,
    POKEDEX_CARD_WIDTH,
    layout.accentBarHeight,
    rgba(accent),
  )

  fill(
    card,
    layout.plate.x,
    layout.plate.y,
    layout.plate.size,
    layout.plate.size,
    rgba(palette.plate, palette.plateAlpha),
  )
  placeArtwork(card, await Jimp.read(args.artworkPng))

  const titleFont = await font(palette.light ? SANS_32_BLACK : SANS_32_WHITE)
  const smallFont = await font(palette.light ? SANS_16_BLACK : SANS_16_WHITE)
  card.print({
    font: smallFont,
    x: layout.column.x,
    y: layout.number.y,
    text: pokedexNumber(subject.number),
  })
  card.print({ font: titleFont, x: layout.column.x, y: layout.name.y, text: subject.displayName })

  await paintTypeChips(card, subject)
  await paintStats(card, subject, palette)

  const total = subject.stats.reduce((sum, stat) => sum + stat.base, 0)
  card.print({
    font: smallFont,
    x: layout.column.x,
    y: layout.footer.y,
    text: `BASE STAT TOTAL ${total}`,
  })

  return await card.getBuffer(POKEDEX_CARD_MIME)
}
