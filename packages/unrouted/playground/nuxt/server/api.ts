import createApi from '../../../test/fixtures/api/myApi'

const api = createApi({
  prefix: '/__api',
})

export default api.handle
