/**
 * The whole type surface for stylesheet imports.
 *
 * A `*.module.css` default export is a bag of strings and TypeScript is told exactly that — no
 * generated sidecar per stylesheet. What guards a mistyped class is `cssModuleUsage.test.ts`,
 * which reads the component and the stylesheet and compares them in both directions. That test
 * can only see reads it can resolve statically, which is why a class is always read by literal
 * property access and a variant map is always written out in full.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {
  const url: string
  export default url
}
