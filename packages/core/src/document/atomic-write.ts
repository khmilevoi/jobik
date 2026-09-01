import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { FlowSaveError } from '#errors.js'

/**
 * Backoff before each retry of the rename, in milliseconds. Eleven attempts, ~1.5s of waiting in
 * the worst case.
 *
 * The budget is set by the longest overlapping READER, not by how long a rename takes. A reader is
 * not one event: the Studio reads the document at the head of every run, and a caller polling the
 * file — `StudioApp.e2e.test.tsx`'s save assertion reads it every 50ms — is a fresh handle several
 * times a second. A budget of ~150ms spans only three such polls, so on a loaded machine the rename
 * could meet an open handle on every attempt and the save failed outright, leaving the old bytes on
 * disk. That is what made the gate's drag-and-save case fail while the same test passed alone.
 *
 * The early delays stay short so the common case — one reader already closing — costs nothing
 * noticeable. The tail is spaced so the whole budget covers a reader that keeps reopening. It stays
 * comfortably under the 3s bound `atomic-write.test.ts` puts on a save that can never succeed.
 */
const renameRetryDelays = [10, 20, 40, 80, 120, 160, 200, 240, 280, 320]

/** The codes Windows answers when the rename is refused for a reason that may pass on its own. */
const retryableRenameCodes = new Set(['EPERM', 'EBUSY', 'EACCES'])

const errorCode = (cause: unknown): string | undefined =>
  typeof cause === 'object' && cause !== null && 'code' in cause
    ? (cause as { code?: unknown }).code === undefined
      ? undefined
      : String((cause as { code?: unknown }).code)
    : undefined

/**
 * Whether a refused rename is worth retrying at all. A target that is a directory, or one we are
 * not allowed to write — the read-only document of `errorFieldCoverage.test.ts`, say — answers the
 * same code forever, so spending the budget on it is pure delay. `ENOENT` from the probe means the
 * target is simply not there yet, which says nothing about the refusal, so that case stays
 * retryable.
 */
async function renameIsWorthRetrying(cause: unknown, target: string): Promise<boolean> {
  const code = errorCode(cause)
  if (code === undefined || !retryableRenameCodes.has(code)) return false
  try {
    if ((await fs.stat(target)).isDirectory()) return false
    await fs.access(target, fs.constants.W_OK)
    return true
  } catch (probe) {
    return errorCode(probe) === 'ENOENT'
  }
}

/**
 * Rename the temporary over the target, retrying a bounded number of times while the refusal looks
 * transient. Windows' `MoveFileExW(…, MOVEFILE_REPLACE_EXISTING)` cannot replace a file another
 * handle holds open unless that handle was opened `FILE_SHARE_DELETE`, and libuv does not open with
 * it — so any overlapping read of the document (`readFlowDocument` at the head of every run, an
 * editor, a scanner) makes this fail `EPERM` until the reader lets go.
 */
async function renameWithRetry(temporary: string, target: string): Promise<void> {
  for (const backoff of renameRetryDelays) {
    try {
      await fs.rename(temporary, target)
      return
    } catch (cause) {
      if (!(await renameIsWorthRetrying(cause, target))) throw cause
      await delay(backoff)
    }
  }
  await fs.rename(temporary, target)
}

/** The uuid `temporaryFor` puts in the middle of a name, in characters. */
const UUID_LENGTH = 36

/** The prefix every temporary of one target shares: hidden, and named after the target. */
const temporaryPrefixOf = (target: string): string => `.${path.basename(target)}.`

/**
 * The temporary this module gives one write of `target`: beside the target so the rename never
 * crosses a filesystem, and unique so two concurrent writers never share one.
 */
const temporaryFor = (target: string): string =>
  path.join(path.dirname(target), `${temporaryPrefixOf(target)}${randomUUID()}.tmp`)

/**
 * Whether a directory entry is one of `target`'s temporaries. Deliberately not a regular expression
 * built from the target's own name: a flow document may be named anything, and a name that has to
 * be escaped into a pattern is a name that can be got wrong. Matching the prefix, the suffix and
 * the exact length of the uuid between them is the same test, spelled so it cannot misfire.
 */
const isTemporaryOf = (target: string, entry: string): boolean => {
  const prefix = temporaryPrefixOf(target)
  return (
    entry.startsWith(prefix) &&
    entry.endsWith('.tmp') &&
    entry.length === prefix.length + UUID_LENGTH + '.tmp'.length
  )
}

/**
 * How old an orphan must be before the sweep will remove it. A temporary belonging to a write that
 * is still in flight — this process's or another's — is minutes younger than this, so the threshold
 * is what keeps the sweep from deleting live work rather than dead work.
 */
const ORPHAN_AGE_MS = 60 * 60 * 1000

/**
 * Remove temporaries left behind by a write that never reached its rename.
 *
 * The `catch` in `writeFileAtomic` deletes the temporary whenever the write itself fails, so the
 * only way one survives is a process that stopped between `fs.open` and `fs.rename` — a kill, a
 * crash, a power loss. No `finally` can cover that case, and nothing else in the repository ever
 * looks at these files, so without a sweep they accumulate beside the document forever.
 *
 * It runs after a successful rename, never before: housekeeping must not delay a save, and must
 * never be able to fail one. Every failure here is therefore swallowed — a directory we cannot
 * read, or a file another process removed between the listing and the unlink, says nothing about
 * the write that just succeeded.
 */
async function sweepOrphanedTemporaries(target: string, now: number): Promise<void> {
  const directory = path.dirname(target)
  const entries = await fs.readdir(directory).catch(() => [] as string[])
  await Promise.all(
    entries
      .filter((entry) => isTemporaryOf(target, entry))
      .map(async (entry) => {
        const orphan = path.join(directory, entry)
        try {
          if (now - (await fs.stat(orphan)).mtimeMs < ORPHAN_AGE_MS) return
          await fs.rm(orphan, { force: true })
        } catch {
          // Gone already, or not ours to remove. Either way the save stands.
        }
      }),
  )
}

/**
 * Flush the directory entry the rename just created.
 *
 * `handle.sync()` in the writer flushes the temporary's DATA; on POSIX the rename that publishes it
 * is a separate metadata operation, and a power loss between the two can leave the directory still
 * naming the old inode even though the new bytes are safely on disk. Fsyncing the directory closes
 * that window.
 *
 * Windows has no such call — a directory cannot be opened for reading the way a file can, and
 * `fs.open` answers `EISDIR`/`EPERM`/`EACCES` — and the failure is not interesting there, because
 * `MoveFileEx` has already committed. So this reports nothing: the rename succeeded either way,
 * and turning an unsupported fsync into `FlowSaveError` would fail saves that are in fact durable.
 */
async function syncDirectory(directory: string): Promise<void> {
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(directory, 'r')
    await handle.sync()
  } catch {
    // Not supported on this platform or this filesystem. The rename itself already succeeded.
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/**
 * Write a file atomically: a uniquely named temporary beside the target, flushed to disk, then
 * renamed over it. The temporary shares the target's directory so the rename never crosses a
 * filesystem. On POSIX `rename` replaces an existing file outright; on Windows it can be refused
 * while another handle holds the target open, so the rename is retried on a short bounded backoff —
 * see `renameWithRetry`. Either way a reader sees the old file or the new one, never a half-written
 * document.
 *
 * Writing is an error boundary, so a filesystem failure is returned as `FlowSaveError` with the
 * original as `cause`, and the temporary is removed on the way out.
 *
 * A successful write then does two things no caller asked for and neither of which it may fail on:
 * it fsyncs the directory so the rename is as durable as the bytes, and it sweeps temporaries an
 * earlier crash orphaned. See `syncDirectory` and `sweepOrphanedTemporaries`.
 */
export async function writeFileAtomic(args: {
  path: string
  contents: string
}): Promise<undefined | FlowSaveError> {
  const directory = path.dirname(args.path)
  const temporary = temporaryFor(args.path)
  const startedAt = Date.now()
  try {
    const handle = await fs.open(temporary, 'w')
    try {
      await handle.writeFile(args.contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await renameWithRetry(temporary, args.path)
    await syncDirectory(directory)
    await sweepOrphanedTemporaries(args.path, startedAt)
    return undefined
  } catch (cause) {
    // Deliberately silent. The save has already failed and `FlowSaveError` carries the reason it
    // failed; a cleanup that also fails leaves a stale temporary the sweep above collects on the
    // next successful write, and `errors.ts` is frozen with no field to report it in anyway.
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    return new FlowSaveError({ path: args.path, cause })
  }
}
