import supertest, { SuperTest, Test } from 'supertest'
import createExpressApp from 'express'
import createApi from './fixtures/api/myApi'
import * as assertions from './assertions'

describe('express provider', () => {
  let app = createExpressApp()
  let api = createApi({ debug: true })
  let request: SuperTest<Test> = supertest(app)

  app.use(api)

  Object.values(assertions)
    .forEach(assertion => assertion(request))

  test('can run with third-party middleware', async() => {
    app = createExpressApp()
    api = createApi({ debug: true })
    request = supertest(app)

    app.use(api)
  })
})
