// Legacy fallback for Node10 module resolution. Modern consumers use
// types.d.mts via the package.json exports map. Both re-export the same
// declarations from dist/index.
export * from './dist/index.mjs'
