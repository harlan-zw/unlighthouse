// Scenario 5: UI types-only — pure `import type` from contracts. Should
// produce zero runtime bytes (only the wrapper export remains).
import type * as contracts from '@unlighthouse/contracts'

export type Surface = typeof contracts
