/**
 * `@jobik/ui/server` Node surface. Named imports only —
 * `import { defineJobikConfig } from '@jobik/ui/server'`.
 *
 * APPEND-ONLY. Each plan appends its own `export` lines and edits no existing line.
 */

// --- Closeout 8-D / 11: serving the built Studio ---
export * from './cli.js'
// --- P10 server-core ---
export * from './config.js'
export * from './descriptor.js'
export * from './discovery.js'
export * from './extensionBundle.js'
export * from './flowService.js'
export * from './httpServer.js'
export * from './routes.js'
export * from './runRegistry.js'
// `runTestSupport.js` stays out of the barrel, like `testSupport.js`.
export * from './runRoutes.js'
// --- P13 server-run ---
// `stackFrames.js` stays internal, like `wireSafety.js`: it is a detail of how `runWire.js`
// projects a failed node, not something a consumer calls.
export * from './runWire.js'
export * from './studioAssets.js'
export * from './wireError.js'
