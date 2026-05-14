// Design system layer: shared UI primitives, chart types, and presentation utilities used across
// every layer. No domain logic — domain types live in pro-saas/shared per ADR-0005.

export default {
  components: [
    {
      path: './components',
      pathPrefix: false,
    },
  ],
}
