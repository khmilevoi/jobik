/**
 * The only stylesheet in the Studio. Everything else is an inline style built from `tokens.ts`.
 *
 * Transcribed from the design file's `<style>` block. Scoped under `[data-jobik-studio]` so the
 * package never restyles a host application, and delivered as a rendered `<style>` element so the
 * library build never has to bundle CSS.
 */
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
