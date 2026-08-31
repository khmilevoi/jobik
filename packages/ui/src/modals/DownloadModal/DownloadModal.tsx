import { useId } from 'react'
import { StripePlaceholder } from '#canvas/StripePlaceholder/StripePlaceholder.js'
import { cx } from '#cx.js'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { DownloadIcon } from '#primitives/icons/DownloadIcon.js'
import { Button, Checkbox, SegmentedControl, Toggle } from '#primitives/index.js'
import s from './DownloadModal.module.css'

/** §3 — the three formats the segmented control offers, and the only three. */
export type DownloadFormat = 'png' | 'webp' | 'jpg'

export const downloadFormats = ['png', 'webp', 'jpg'] as const satisfies readonly DownloadFormat[]

export interface DownloadFile {
  /** The mono file name — `cover.png`. */
  readonly name: string
  /** The right-aligned mono metadata, already formatted — `1024² · 412 kb`, `1200×630 · 208 kb`. */
  readonly meta: string
  readonly selected: boolean
}

export interface DownloadModalProps {
  /** The mono context line, e.g. `render.image · run #221`. */
  readonly context: string
  readonly files: readonly DownloadFile[]
  readonly onToggleFile?: (name: string) => void
  readonly format: DownloadFormat
  readonly onFormatChange?: (format: DownloadFormat) => void
  readonly bundleAsZip: boolean
  readonly onBundleChange?: (bundle: boolean) => void
  /** The resulting archive's name, under the toggle's label — e.g. `jobik-221-output.zip`. */
  readonly zipFileName: string
  /** The footer's left-hand summary, already formatted — e.g. `2 of 3 files · 620 kb`. */
  readonly summary: string
  /** The primary's mono size badge, already formatted — e.g. `620 kb`. */
  readonly totalSize: string
  readonly onCancel?: () => void
  readonly onDownload?: () => void
  /** `esc`, the `×` and a backdrop click all land here — this dialog is not destructive. */
  readonly onDismiss: () => void
}

/**
 * §3 — the file list, built on `primitives/`'s `Checkbox`, which is `3C`'s box and the design's
 * only one. Unchecking also dims the thumbnail to `.55` and steps both text colours down a level;
 * that part is this row's, not the box's.
 *
 * The whole 46 px row stays the label, so the click target is the row rather than the 14 px box —
 * the primitive's root is a `<span>` precisely so it can nest here. The box carries the file name
 * as its accessible name, because the row also holds a decorative thumbnail and a metadata run
 * that would otherwise be read as part of it.
 */
function DownloadFileRow(props: {
  readonly file: DownloadFile
  readonly onToggle?: (name: string) => void
}) {
  const { file } = props
  const boxId = useId()
  return (
    <label
      htmlFor={boxId}
      data-testid="download-file"
      className={cx(s.fileRow, file.selected && s.fileRowSelected)}
    >
      <Checkbox
        id={boxId}
        checked={file.selected}
        label={file.name}
        onChange={() => props.onToggle?.(file.name)}
      />
      <span className={s.thumb}>
        <StripePlaceholder height={30} radius={3} opacity={file.selected ? undefined : 0.55} />
      </span>
      <span
        data-testid="download-file-name"
        className={cx(s.fileName, file.selected ? s.fileNameOn : s.fileNameOff)}
      >
        {file.name}
      </span>
      <span className={s.spacer} />
      <span
        data-testid="download-file-meta"
        className={cx(s.fileMeta, file.selected ? s.fileMetaOn : s.fileMetaOff)}
      >
        {file.meta}
      </span>
    </label>
  )
}

/** The three formats as the shape `SegmentedControl` takes. Label and value are the same word. */
const FORMAT_OPTIONS = downloadFormats.map((format) => ({ value: format, label: format }))

/**
 * §3 — **the design's only segmented control**, now `primitives/`'s. Only the row around it is
 * this modal's: the `Format` label sits outside the track, and the track fills the rest.
 */
function FormatControl(props: {
  readonly format: DownloadFormat
  readonly onChange?: (format: DownloadFormat) => void
}) {
  return (
    <div className={s.row}>
      <div className={s.rowLabel}>Format</div>
      <SegmentedControl
        options={FORMAT_OPTIONS}
        value={props.format}
        onChange={props.onChange}
        label="Format"
      />
    </div>
  )
}

/**
 * §3 — **the design's only toggle**, now `primitives/`'s, including the off state the design does
 * not draw and `09-modals.md` says to extrapolate. Only the two-line label is this modal's: the
 * row carries the resulting archive name under `Bundle as zip`.
 */
function BundleToggle(props: {
  readonly bundleAsZip: boolean
  readonly zipFileName: string
  readonly onChange?: (bundle: boolean) => void
}) {
  return (
    <div className={s.row}>
      <div className={s.bundleLabel}>
        <div className={s.rowLabel}>Bundle as zip</div>
        <div data-testid="download-zip-name" className={s.zipName}>
          {props.zipFileName}
        </div>
      </div>
      <Toggle
        checked={props.bundleAsZip}
        label="Bundle as zip"
        onChange={props.onChange}
        data-testid="download-bundle-toggle"
      />
    </div>
  )
}

/**
 * `3C` Modal B — **Download output**, `520px`. `09-modals.md` §3.
 *
 * The three controls under the file list — the checkbox, the segmented control and the toggle —
 * are each the only one of their kind in the whole design, and all three live in this artboard.
 * They were private to this file until `primitives/` landed; they are now `Checkbox`,
 * `SegmentedControl` and `Toggle`, and what is left here is only the row layout each sits in.
 *
 * Nothing here computes a size or a count. `summary` and `totalSize` arrive formatted, because
 * neither is derivable from the wire — see the plan report's `Not fixable from v1 data`.
 */
export function DownloadModal(props: DownloadModalProps) {
  const actions = (
    <>
      <Button variant="quiet" size="modal" onClick={props.onCancel}>
        Cancel
      </Button>
      <Button
        variant="accent"
        size="modal"
        icon={<DownloadIcon strokeWidth={1.2} />}
        hint={props.totalSize}
        onClick={props.onDownload}
      >
        Download
      </Button>
    </>
  )

  return (
    <ModalShell
      data-testid="download-modal"
      title="Download output"
      width={520}
      bodyGap={14}
      header={{ context: props.context, onClose: props.onDismiss }}
      hint={props.summary}
      actions={actions}
      onDismiss={props.onDismiss}
    >
      <div className={s.fileList}>
        {props.files.map((file) => (
          <DownloadFileRow key={file.name} file={file} onToggle={props.onToggleFile} />
        ))}
      </div>
      <div className={s.divider} />
      <FormatControl format={props.format} onChange={props.onFormatChange} />
      <BundleToggle
        bundleAsZip={props.bundleAsZip}
        zipFileName={props.zipFileName}
        onChange={props.onBundleChange}
      />
    </ModalShell>
  )
}
