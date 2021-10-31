import supertest, { SuperTest, Test } from 'supertest'
import Koa, { Middleware } from 'koa'
import createApi from './fixtures/api/myApi'
import * as assertions from './assertions'

const koa = new Koa()
const server = koa.listen()

describe('koa provider', () => {
  const api = createApi({ debug: true })
  const request: SuperTest<Test> = supertest(server)

  // runtime config change to koa provider
  koa.use(api as unknown as Middleware)

  Object.values(assertions)
    .forEach(assertion => assertion(request))

  server.close()
})
