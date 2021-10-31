import supertest, { SuperTest, Test } from 'supertest'
import { createApp as createH3App } from 'h3'
import createApi from './fixtures/api/myApi'
import * as assertions from './assertions'

describe('h3 provider', () => {
  const app = createH3App()

  const api = createApi({ debug: true })
  const request: SuperTest<Test> = supertest(app)

  app.use(api)

  Object.values(assertions)
    .forEach(assertion => assertion(request))
})
