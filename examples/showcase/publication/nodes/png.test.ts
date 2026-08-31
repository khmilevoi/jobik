import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { encodePng, type Rgb } from './png.js'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunkTypes(png: Buffer): string[] {
  const types: string[] = []
  let at = SIGNATURE.length
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    types.push(png.toString('ascii', at + 4, at + 8))
    at += 12 + length
  }
  return types
}

function chunkData(png: Buffer, type: string): Buffer {
  let at = SIGNATURE.length
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    if (png.toString('ascii', at + 4, at + 8) === type) {
      return png.subarray(at + 8, at + 8 + length)
    }
    at += 12 + length
  }
  throw new Error(`chunk ${type} not found`)
}

describe('encodePng()', () => {
  const red: Rgb = [255, 0, 0]
  const blue: Rgb = [0, 0, 255]
  const png = encodePng({ width: 4, height: 3, pixel: (_x, y) => (y === 1 ? blue : red) })

  it('starts with the PNG signature', () => {
    expect(png.subarray(0, 8).equals(SIGNATURE)).toBe(true)
  })

  it('writes IHDR, sRGB, IDAT and IEND in that order', () => {
    expect(chunkTypes(png)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IEND'])
  })

  it('declares the requested dimensions as 8-bit truecolour', () => {
    const ihdr = chunkData(png, 'IHDR')
    expect(ihdr.readUInt32BE(0)).toBe(4)
    expect(ihdr.readUInt32BE(4)).toBe(3)
    expect([ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]]).toEqual([8, 2, 0, 0, 0])
  })

  it('round-trips the scanlines through the IDAT stream', () => {
    const raw = inflateSync(chunkData(png, 'IDAT'))
    expect(raw.length).toBe(3 * (1 + 4 * 3))
    expect(raw[0]).toBe(0)
    expect([...raw.subarray(1, 4)]).toEqual([255, 0, 0])
    expect([...raw.subarray(14, 17)]).toEqual([0, 0, 255])
  })

  it('writes a CRC that matches every chunk', () => {
    // Independently compute CRC-32 for each chunk and verify it matches the stored value.
    // The PNG polynomial is 0xedb88320 (reflected).
    const crcTable = (() => {
      const table = new Uint32Array(256)
      for (let n = 0; n < 256; n += 1) {
        let c = n
        for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
      }
      return table
    })()

    function computeCrc32(bytes: Buffer): number {
      let c = 0xffffffff
      for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
      return (c ^ 0xffffffff) >>> 0
    }

    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    let at = signature.length
    let chunkCount = 0

    while (at < png.length) {
      const length = png.readUInt32BE(at)
      const typeBytes = png.subarray(at + 4, at + 8)
      const dataBytes = png.subarray(at + 8, at + 8 + length)
      const storedCrc = png.readUInt32BE(at + 8 + length)

      // Compute CRC over type + data
      const toHash = Buffer.concat([typeBytes, dataBytes])
      const computedCrc = computeCrc32(toHash)

      expect(computedCrc).toBe(storedCrc)
      chunkCount += 1
      at += 12 + length
    }

    // Ensure we visited all chunks
    expect(chunkCount).toBe(4)
  })

  it('is deterministic for identical input', () => {
    const again = encodePng({ width: 4, height: 3, pixel: (_x, y) => (y === 1 ? blue : red) })
    expect(again.equals(png)).toBe(true)
  })
})
