import '@xyflow/react/dist/style.css'
import * as React from 'react'
import { StrictMode } from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as jobikUi from '../index.js'
import { StudioApp } from './StudioApp.js'

/**
 * The Studio entry point.
 *
 * The externals map is built HERE and not inside `StudioApp`, because `@jobik/ui`'s own barrel
 * re-exports `StudioApp`; importing the barrel from inside it would close a module cycle. `main.tsx`
 * is not part of the barrel, so it can import both ends safely.
 *
 * A flow-local `flow.ui.tsx` bundle leaves the server with these specifiers unresolved; the
 * extension loader rewrites them to shims over these live namespaces.
 *
 * `@jobik/core` is deliberately absent from this map. It imports `node:fs` (`document/read.ts`),
 * so it is not browser-safe and cannot be bundled here. An extension that imports a runtime value
 * from it gets `extensionLoader.ts`'s own `FlowUiLoadError` and the generic output fallback — the
 * honest outcome, not a gap to paper over.
 */
const externals = {
  '@jobik/ui': jobikUi as unknown as Record<string, unknown>,
  react: React as unknown as Record<string, unknown>,
  'react-dom': ReactDOM as unknown as Record<string, unknown>,
  'react-dom/client': ReactDOMClient as unknown as Record<string, unknown>,
  'react/jsx-runtime': ReactJsxRuntime as unknown as Record<string, unknown>,
}

const container = globalThis.document.getElementById('root')
if (container !== null) {
  ReactDOMClient.createRoot(container).render(
    <StrictMode>
      <StudioApp externals={externals} />
    </StrictMode>,
  )
}
