/**
 * The Studio's two global stylesheets, and the `<style>` element that has always delivered them.
 *
 * `tokens.css` carries every design token as a custom property and `globalStyles.css` carries the
 * reset and the four motion loops. Importing them here is what puts them in the module graph, so a
 * bundler emits them — `dist/index.css` for a consumer of the package, an `assets/*.css` link for
 * the Studio bundle. Every `*.module.css` in the package reads `var(--jbk-…)` and depends on that
 * import having happened.
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
  '@keyframes jspin{to{transform:rotate(360deg)}}',
  '@keyframes jdash{to{stroke-dashoffset:-24}}',
  '@keyframes jshim{0%{background-position:130% 0}100%{background-position:-30% 0}}',
  '@keyframes jpulse{0%,100%{opacity:.4}50%{opacity:1}}',
].join('')

export function StudioStyles() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant stylesheet, no user input
  return <style data-jobik-styles dangerouslySetInnerHTML={{ __html: STUDIO_GLOBAL_CSS }} />
}
