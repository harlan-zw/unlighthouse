// register vue composition api globally
import { createApp } from 'vue'
import App from './App.vue'

// windicss layers
import 'virtual:windi-base.css'
import 'virtual:windi-components.css'
import 'virtual:windi-utilities.css'
import 'virtual:windi-devtools'

const app = createApp(App)
app.mount('#app')
