import { SuperTest, Test } from 'supertest'

export async function redirects(request: SuperTest<Test>) {
  it('temporary redirect works', async() => {
    const redirect = await request.get('/old-link')
    expect(redirect.redirect).toBeTruthy()
    expect(redirect.headers.location).toEqual('/new-link')
    expect(redirect.statusCode).toEqual(302)
  })

  it('permanent redirect works', async() => {
    const redirect = await request.get('/older-link')
    expect(redirect.redirect).toBeTruthy()
    expect(redirect.headers.location).toEqual('/new-permalink')
    expect(redirect.statusCode).toEqual(301)
  })
}

export default redirects
