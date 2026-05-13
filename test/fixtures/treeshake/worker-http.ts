// Scenario 2: Worker HTTP-only — just the transport-agnostic API surface.
import * as client from '@unlighthouse/core/api/client'
import * as handlers from '@unlighthouse/core/api/handlers'
import * as http from '@unlighthouse/core/api/http'

export default { http, handlers, client }
