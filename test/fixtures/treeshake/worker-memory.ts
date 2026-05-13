// Scenario 4: Worker memory-only — verifies drizzle/sqlite peer-deps stay out
// when only the in-memory storage adapter is imported.
import * as memory from '@unlighthouse/core/storage/memory'

export default memory
