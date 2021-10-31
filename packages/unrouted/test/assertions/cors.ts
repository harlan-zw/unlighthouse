import { SuperTest, Test } from 'supertest'

export function cors(request: SuperTest<Test>) {
  it('shows cors headers', async() => {
    const res = await request.get('/greeting')
    expect(res.headers['access-control-allow-origin']).toEqual('*')
  })
}

export default cors
