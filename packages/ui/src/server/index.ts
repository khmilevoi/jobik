/**
 * `@jobik/ui/server` Node surface. Named imports only —
 * `import { defineJobikConfig } from '@jobik/ui/server'`.
 *
 * APPEND-ONLY. Each plan appends its own `export` lines and edits no existing line.
 */

// --- P10 server-core ---
export * from './config.js'
export * from './descriptor.js'
export * from './discovery.js'
export * from './flowService.js'
export * from './httpServer.js'
export * from './routes.js'
export * from './wireError.js'
