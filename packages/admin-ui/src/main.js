import { createApp } from 'vue';
import { createAuthPlugin } from 'stork-vue-auth-client';
import App from './App.vue';
import './style.css';
import { apiClient } from './apiClient.js';

const app = createApp(App);

// Регистрируем auth plugin
app.use(createAuthPlugin({
  apiClient,
  configEndpoint: '/api/config',
}));

// Предоставляем apiClient для использования в компонентах
app.provide('apiClient', apiClient);

app.mount('#app');
