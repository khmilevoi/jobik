/**
 * The Studio's two global stylesheets, and the `<style>` element that has always delivered them.
 *
 * `tokens.css` carries every design token as a custom property and `globalStyles.css` carries the
 * reset and every keyframe the design names. Importing them here is what puts them in the module graph, so a
 * bundler emits them. The one that matters is the Studio bundle's `assets/*.css` link: that bundle
 * is what `jobik-studio` serves and the only way this UI reaches a browser. `tsdown` also emits
 * `dist/style.css` from the browser entry, which nothing loads — see `CLAUDE.md` § Styling. Every
 * `*.module.css` in the package reads `var(--jbk-…)` and depends on this import having happened.
 *
 * `STUDIO_GLOBAL_CSS` and `StudioStyles` are exported from the append-only barrel and keep working
 * unchanged. The string mirrors `globalStyles.css` — `globalStyles.test.tsx` fails when the two
 * drift, so there is still one source of truth — and it stays because a host that cannot import a
 * stylesheet still gets the reset by rendering `<StudioStyles />`. `tokens.css` has no such mirror:
 * custom properties are only useful to a stylesheet, and a host in that position has none.
 */
import './tokens.css'
import './globalStyles.css'

export const STUDIO_GLOBAL_CSS = [
  '[data-jobik-studio],[data-jobik-studio] *,[data-jobik-studio] *::before,',
  '[data-jobik-studio] *::after{box-sizing:border-box}',
  '[data-jobik-studio] button{font-family:inherit;margin:0;cursor:pointer}',
  '[data-jobik-studio]{scrollbar-width:thin;',
  'scrollbar-color:var(--jbk-scrollbar-thumb) var(--jbk-scrollbar-track)}',
  '@supports not (scrollbar-color:auto){',
  '[data-jobik-studio]::-webkit-scrollbar,[data-jobik-studio] ::-webkit-scrollbar',
  '{width:var(--jbk-scrollbar-width);height:var(--jbk-scrollbar-width)}',
  '[data-jobik-studio]::-webkit-scrollbar-track,[data-jobik-studio] ::-webkit-scrollbar-track',
  '{background:var(--jbk-scrollbar-track);border-radius:var(--jbk-scrollbar-radius)}',
  '[data-jobik-studio]::-webkit-scrollbar-thumb,[data-jobik-studio] ::-webkit-scrollbar-thumb',
  '{background:var(--jbk-scrollbar-thumb);border-radius:var(--jbk-scrollbar-radius)}}',
  '@media (prefers-reduced-motion:reduce){[data-jobik-studio]{',
  '--jbk-motion-edge-dash:none;--jbk-motion-shimmer:none;',
  '--jbk-motion-pulse-slow:none;--jbk-motion-pulse-fast:none;',
  '--jbk-motion-validate-sweep:none;--jbk-motion-result-pop:none;',
  '--jbk-motion-swap-fade:none;--jbk-motion-line-in:none;',
  '--jbk-motion-duration-pointer:0ms;--jbk-motion-duration-swap:0ms;',
  '--jbk-motion-duration-state:0ms;--jbk-motion-duration-layout:0ms;',
  '--jbk-motion-duration-overlay-in:0ms;--jbk-motion-duration-exit:0ms;',
  '--jbk-motion-duration-screen:0ms}}',
  '@keyframes jspin{to{transform:rotate(360deg)}}',
  '@keyframes jdash{to{stroke-dashoffset:-24}}',
  '@keyframes jshim{0%{background-position:130% 0}100%{background-position:-30% 0}}',
  '@keyframes jpulse{0%,100%{opacity:.4}50%{opacity:1}}',
  '@keyframes jsweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}',
  '@keyframes jpop{from{opacity:0;transform:translateY(2px) scale(.97)}to{opacity:1;transform:none}}',
  '@keyframes jfade{from{opacity:0}to{opacity:1}}',
  '@keyframes jline{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}',
].join('')

export function StudioStyles() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant stylesheet, no user input
  return <style data-jobik-styles dangerouslySetInnerHTML={{ __html: STUDIO_GLOBAL_CSS }} />
}
