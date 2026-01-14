# @demo/vue-auth-client

Vue 3 authentication client plugin с поддержкой OIDC (OpenID Connect).

## Описание

Vue 3 Plugin для управления авторизацией в приложениях:
- Управление JWT токенами
- Загрузка конфигурации авторизации с бэкенда
- Автоматическая настройка Axios interceptors
- Реактивное состояние через Vue 3 Composition API
- Обработка редиректов на авторизацию

## Установка

```bash
npm install @demo/vue-auth-client
```

## Использование

### 1. Регистрация плагина

```javascript
// main.js
import { createApp } from 'vue';
import { createAuthPlugin } from '@demo/vue-auth-client';
import axios from 'axios';
import App from './App.vue';

const apiClient = axios.create({
  baseURL: '/api',
});

const app = createApp(App);

app.use(createAuthPlugin({
  apiClient,
  configEndpoint: '/api/config',
}));

app.mount('#app');
```

### 2. Использование в компонентах

```vue
<script setup>
import { onMounted } from 'vue';
import { useAuth } from '@demo/vue-auth-client';
import { api } from './api';

const { 
  currentUser,
  isAuthenticated,
  isLoadingConfig,
  isVerifyingAuth,
  login,
  logout,
  verifyAuth,
  handleTokenFromQuery,
} = useAuth();

onMounted(async () => {
  // Обрабатываем токен из query параметров (если есть)
  handleTokenFromQuery();
  
  // Проверяем авторизацию
  await verifyAuth();
});
</script>

<template>
  <div>
    <div v-if="isVerifyingAuth">Checking authentication...</div>
    <div v-else-if="isAuthenticated">
      <p>Welcome, {{ currentUser?.name }}!</p>
      <button @click="logout">Logout</button>
    </div>
    <div v-else>
      <button @click="login">Login</button>
    </div>
  </div>
</template>
```

## API

### createAuthPlugin(options)

Создает Vue 3 Plugin для авторизации.

**Параметры:**
- `options.apiClient` (обязательный) - Axios instance
- `options.configEndpoint` (обязательный) - Endpoint для загрузки конфигурации
- `options.tokenKey` (опционально) - Ключ для хранения токена (по умолчанию 'jwt_token')
- `options.configKey` (опционально) - Ключ для хранения конфигурации (по умолчанию 'auth_config')
- `options.configCacheTTL` (опционально) - TTL кэша конфигурации в мс (по умолчанию 5 минут)
- `options.redirectCooldown` (опционально) - Cooldown между редиректами в мс (по умолчанию 2 секунды)
- `options.onConfigError` (опционально) - Callback для ошибки загрузки конфигурации

### useAuth()

Vue 3 Composable для работы с авторизацией.

**Возвращает:**
- `currentUser` - Ref с данными текущего пользователя
- `token` - Ref с JWT токеном
- `config` - Ref с конфигурацией авторизации
- `isAuthenticated` - ComputedRef: авторизован ли пользователь
- `isLoadingConfig` - Ref: загружается ли конфигурация
- `isVerifyingAuth` - Ref: проверяется ли авторизация
- `isLoadingUser` - Ref: загружаются ли данные пользователя
- `login()` - Редирект на авторизацию (алиас для redirectToAuth)
- `redirectToAuth()` - Редирект на авторизацию
- `logout()` - Выход (очистка токена и пользователя)
- `verifyAuth()` - Проверка токена и загрузка пользователя
- `fetchUser()` - Загрузка данных пользователя с сервера
- `loadConfig(force?)` - Загрузка конфигурации
- `handleTokenFromQuery()` - Обработка токена из URL query параметров
- `clearConfigCache()` - Очистка кэша конфигурации

## Лицензия

MIT
