import supertest, { SuperTest, Test } from 'supertest'
import createConnectApp from 'connect'
import createApi from './fixtures/api/myApi'
import * as assertions from './assertions'

describe('connect provider', () => {
  const app = createConnectApp()
  const api = createApi({ debug: true })
  const request: SuperTest<Test> = supertest(app)
  app.use(api)

  Object.values(assertions)
    .forEach(assertion => assertion(request))
})
