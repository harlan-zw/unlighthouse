// register vue composition api globally
import { createApp } from 'vue'
import App from './App.vue'

// tailwind css
import './index.css'

const app = createApp(App)
app.mount('#app')
