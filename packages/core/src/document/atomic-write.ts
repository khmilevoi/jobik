import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { FlowSaveError } from '#errors.js'

/**
 * Write a file atomically: a uniquely named temporary beside the target, flushed to disk, then
 * renamed over it. The temporary shares the target's directory so the rename never crosses a
 * filesystem, and `rename` replaces an existing file on both Windows and POSIX. A reader therefore
 * sees either the old file or the new one, never a half-written document.
 *
 * Writing is an error boundary, so a filesystem failure is returned as `FlowSaveError` with the
 * original as `cause`, and the temporary is removed on the way out.
 */
export async function writeFileAtomic(args: {
  path: string
  contents: string
}): Promise<undefined | FlowSaveError> {
  const directory = path.dirname(args.path)
  const temporary = path.join(directory, `.${path.basename(args.path)}.${randomUUID()}.tmp`)
  try {
    const handle = await fs.open(temporary, 'w')
    try {
      await handle.writeFile(args.contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temporary, args.path)
    return undefined
  } catch (cause) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    return new FlowSaveError({ path: args.path, cause })
  }
}
