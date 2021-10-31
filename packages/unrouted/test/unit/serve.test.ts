import supertest, { SuperTest, Test } from 'supertest'
import { createApp as createH3App } from 'h3'
import simpleServeApi from '../fixtures/api/simpleServeApi'
import { serve } from '../assertions'

describe('config test', () => {
  const app = createH3App()

  const api = simpleServeApi()
  const request: SuperTest<Test> = supertest(app)

  app.use(api)

  it('serving sub api works', async() => {
    const subApiResponse = await request.get('/static/my-sub-api')
    expect(subApiResponse.ok).toBeTruthy()
  })

  serve(request)
})
