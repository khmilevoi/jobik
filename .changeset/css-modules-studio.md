---
'@jobik/ui': minor
---

`@jobik/ui` now styles itself with CSS Modules instead of inline style objects, and **ships a
stylesheet for the first time**. Every export that used to hand back `CSSProperties` hands back a
class name instead. Breaking, in five ways.

**1. The package ships CSS, and you must import it.** Until now `@jobik/ui` shipped no CSS at all,
deliberately — `STUDIO_GLOBAL_CSS` / `StudioStyles` existed so the library build never had to
bundle any. The build now emits `dist/style.css` (~52 KB: the design tokens as custom properties,
the keyframes, and every component's hashed classes) and declares it in `exports`. Nothing renders
correctly without it, so add one line beside your `@jobik/ui` import:

```ts
import '@jobik/ui/style.css'
```

`StudioStyles` and `STUDIO_GLOBAL_CSS` are unchanged and still exported, but they no longer carry
the component styling — they never did more than the reset and the keyframes, and those are now in
the stylesheet too.

This is a consumer-facing change and only that: it needs no server or packaging change. The Studio
bundle the `jobik-studio` bin serves is `dist/studio`, whose own asset pipeline already emits its
CSS, and `dist/style.css` is that directory's sibling rather than a file inside it.

*Inside this repository only:* the workspace `exports` map now also points `./style.css` at
`./dist/style.css`, a path that does not exist until someone runs a build. Nothing in the workspace
imports it, so it is dormant — but the first person to write `import '@jobik/ui/style.css'` in
`examples/` or in a test before building will get a module-resolution failure that looks like a bug
and is not one. Run `pnpm turbo run build` first, or import the source stylesheet.

**2. The field-styling helpers return class names.** `fieldEdgeStyle` → `fieldEdgeClass`,
`fieldHandleStyle` → `fieldHandleClass`, `fieldLabelColor` → `fieldLabelClass`,
`fieldAnnotationColor` → `fieldAnnotationClass`. Each takes the same arguments as before and
returns a `string` to put on `className`, not an object to spread into `style`.

**3. `CardChrome` is class names.** It drops from nine colour fields to four class-name fields;
`resolveCardChrome()` keeps its signature. Spread the result onto `className`, not `style`.

**4. `chipStyle()` is gone.** `chipBox()` replaces it and returns `{ className, style }`, because a
chip's `gap` is a caller value the stylesheet cannot know and rides in as a custom property:

```tsx
const box = chipBox({ gap: 7 })
<button className={box.className} style={box.style} />
```

**5. Four `style` props are removed.** `SectionLabel`, `InsetWell`, `OutputViewer` and `RunWell` no
longer accept `style`; pass `className` instead. `RunWell.style` in particular had inverted its
contract under CSS Modules — it began winning over the tone rules rather than losing to them — so
it is removed rather than deprecated further.

**6. `MetadataRow.fontSize` is narrowed to the type scale.** It was `number` and is now
`FontSize`, the union `tokens.ts` already exports. No value changes — the only call sites pass
`9.5`, which is on the scale — but a size outside it is now a compile error.

This one is a repair, not a tightening for its own sake. The colour-discipline tests used to scan
the rendered DOM, so they caught an off-scale size arriving through this prop at runtime. Their
replacement reads stylesheets and sources statically and cannot see a value computed at render
time, so the guarantee would otherwise have been quietly dropped by the migration that replaced
them.

Every primitive, and `OutputViewer`, gained `className?: string`, merged last, which is the
replacement for all of the above. `SectionLabel.color`, `RunWell.padding` and `RunStatusDot.color`
still take a value and still work; they are custom properties now.

Internal, but visible if you read the tokens: five text colours and one accent colour moved from
`canvasTokens.ts` / `runPanelTokens.ts` into `tokens.ts` — `textColors.metadata`,
`.metadataSeparator`, `.slotCaption`, `.actionLabel`, `.failedMeta` and `accent.spinnerTrack`. Each
is read from more than one directory, and a custom property only exists while the stylesheet
declaring it is on the page.
