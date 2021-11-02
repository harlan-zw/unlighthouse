const { $fetch } = require('ohmyfetch')

export default async({ route }) => {
  if (route.path.startsWith('/_') || route.path.includes('.'))
    return

  await $fetch('<%= options.host %>/__routes/api/known-routes', {
    method: 'POST',
    body: {
      name: route.name,
      path: route.path,
      params: route.params,
      component: route.component,
    },
  })
}
