// Stub for the `cloudflare:workers` virtual module so vitest (running in
// Node) can import packages that depend on it transitively
// (@cloudflare/containers extends DurableObject from this module).
//
// We don't run the Workers runtime in tests — anything that actually uses
// these classes (DurableObject lifecycle, ctx, etc.) is exercised against
// the real deploy. Tests here only need the symbols to resolve.

export class DurableObject {
  // eslint-disable-next-line ts/no-explicit-any
  constructor(_ctx?: any, _env?: any) {}
}

export class WorkerEntrypoint {
  // eslint-disable-next-line ts/no-explicit-any
  constructor(_ctx?: any, _env?: any) {}
}
