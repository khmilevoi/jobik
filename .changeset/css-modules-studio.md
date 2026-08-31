---
'@jobik/ui': minor
---

`@jobik/ui` now styles itself with CSS Modules instead of inline style objects. Every export that
used to hand back `CSSProperties` hands back a class name instead. Breaking, in five ways.

Who this reaches: the Studio is launched with `jobik-studio`, which serves a prebuilt bundle, and
that path needs nothing from you. What changes below is the surface a **`flow.ui.tsx` author**
writes against — `defineFlowUi`, the primitives, the canvas helpers — because that file is
authored against this package's types.

**1. The field-styling helpers return class names.** `fieldEdgeStyle` → `fieldEdgeClass`,
`fieldHandleStyle` → `fieldHandleClass`, `fieldLabelColor` → `fieldLabelClass`,
`fieldAnnotationColor` → `fieldAnnotationClass`. Each takes the same arguments as before and
returns a `string` to put on `className`, not an object to spread into `style`.

**2. `CardChrome` is class names.** It drops from nine colour fields to four class-name fields;
`resolveCardChrome()` keeps its signature. Spread the result onto `className`, not `style`.

**3. `chipStyle()` is gone.** `chipBox()` replaces it and returns `{ className, style }`, because a
chip's `gap` is a caller value the stylesheet cannot know and rides in as a custom property:

```tsx
const box = chipBox({ gap: 7 })
<button className={box.className} style={box.style} />
```

**4. Four `style` props are removed.** `SectionLabel`, `InsetWell`, `OutputViewer` and `RunWell` no
longer accept `style`; pass `className` instead. `RunWell.style` in particular had inverted its
contract under CSS Modules — it began winning over the tone rules rather than losing to them — so
it is removed rather than deprecated further.

**5. `MetadataRow.fontSize` is narrowed to the type scale.** It was `number` and is now `FontSize`,
the union `tokens.ts` already exports. No value changes — the only call site passes `9.5`, which is
on the scale — but a size outside it is now a compile error.

This one is a repair, not a tightening for its own sake. The colour-discipline tests used to scan
the rendered DOM, so they caught an off-scale size arriving through this prop at runtime. Their
replacement reads stylesheets and sources statically and cannot see a value computed at render
time, so the guarantee would otherwise have been quietly dropped by the migration that replaced
them.

Every primitive, and `OutputViewer`, gained `className?: string`, merged last, which is the
replacement for all of the above. `SectionLabel.color`, `RunWell.padding` and `RunStatusDot.color`
still take a value and still work; they are custom properties now.

**About the new `dist/style.css`, since you will see it in the tarball: you do not import it.** The
build emits it (~52 KB) from the browser entry and `tsdown` declares it in `exports` on its own.
Nothing loads it. This UI reaches a browser exactly one way — `jobik-studio` serving the prebuilt
`dist/studio`, whose own Vite pipeline emits the CSS its `index.html` links — and a flow's
`flow.ui.tsx` is no exception: the extension build keeps `@jobik/ui` external, so a flow-local
component is styled by the Studio page hosting it. `StudioStyles` and `STUDIO_GLOBAL_CSS` are
unchanged and still exported for a host that renders the reset itself.

Internal, but visible if you read the tokens: five text colours and one accent colour moved from
`canvasTokens.ts` / `runPanelTokens.ts` into `tokens.ts` — `textColors.metadata`,
`.metadataSeparator`, `.slotCaption`, `.actionLabel`, `.failedMeta` and `accent.spinnerTrack`. Each
is read from more than one directory, and a custom property only exists while the stylesheet
declaring it is on the page.
