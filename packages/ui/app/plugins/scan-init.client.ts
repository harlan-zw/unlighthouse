import { useScanStore } from '~/stores/scan'

export default defineNuxtPlugin({
  name: 'scan-init',
  dependsOn: ['ws'],
  setup() {
    const store = useScanStore()
    const { $api, $ws } = useNuxtApp()
    store.init($api, $ws)
  },
})
