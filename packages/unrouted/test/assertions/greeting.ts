import { SuperTest, Test } from 'supertest'

export function greeting(request: SuperTest<Test>) {
  it('simple GET greeting work', async() => {
    const res = await request.get('/greeting')

    expect(res.text).toEqual('Hello :)')
  })

  it('named param GET greeting works', async() => {
    const res = await request.get('/greeting/harlan')
      .query({ greeting: 'Howdy', smiley: '🤠' })

    expect(res.text).toEqual('Howdy harlan 🤠')
  })
}

export default greeting
