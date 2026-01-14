# Vue Auth Client - Спецификация и уточнения

## Вопросы и уточнения перед реализацией

### 1. Конфигурация

**Вопрос:** Нужен ли `fallbackConfig`?

**Решение:** ❌ **НЕ нужен**
- Конфигурация должна загружаться с бэкенда
- Если бэкенд недоступен - это ошибка, которую нужно обработать явно
- Упрощает API и уменьшает неявное поведение

**API:**
```typescript
interface AuthPluginOptions {
  apiClient: AxiosInstance;
  configEndpoint: string;  // Обязательный, без fallback
  tokenKey?: string;        // Опциональный, по умолчанию 'jwt_token'
  configKey?: string;       // Опциональный, по умолчанию 'auth_config'
  configCacheTTL?: number;  // Опциональный, по умолчанию 5 минут
  redirectCooldown?: number; // Опциональный, по умолчанию 2 секунды
}
```

---

### 2. Функция login()

**Вопрос:** Зачем нужна функция `login()` в composable?

**Анализ текущего кода:**
- В `App.vue` есть `login()` которая вызывает `redirectToAuth()`
- `redirectToAuth()` делает редирект на страницу авторизации
- Это просто обертка для удобства

**Решение:** ✅ **Оставить, но упростить**
- `login()` = алиас для `redirectToAuth()`
- Более семантичное название для использования в компонентах
- Можно использовать и `redirectToAuth()` напрямую

**API:**
```typescript
interface UseAuthReturn {
  // ...
  login: () => Promise<void>;        // Алиас для redirectToAuth
  redirectToAuth: () => Promise<void>; // Прямой вызов
  // ...
}
```

**Использование:**
```vue
<template>
  <button @click="login">Login</button>
  <!-- или -->
  <button @click="redirectToAuth">Login</button>
</template>
```

---

### 3. Именование: user vs authUser vs loggedUser

**Вопрос:** Как назвать реактивное состояние пользователя?

**Варианты:**
- `user` - короткое, но может конфликтовать с другими `user` в компонентах
- `authUser` - явное, но длинное
- `loggedUser` - явное, но может быть неактуально (пользователь может быть не "logged in", а просто авторизован)
- `currentUser` - стандартное название в многих системах

**Решение:** ✅ **`currentUser`**
- Стандартное название в Vue/React экосистеме
- Явное и понятное
- Не конфликтует с другими переменными
- Соответствует паттернам (например, Firebase использует `currentUser`)

**Альтернатива:** Если хотим короче - можно `user`, но тогда нужно быть осторожным с конфликтами.

**API:**
```typescript
interface UseAuthReturn {
  currentUser: Ref<User | null>;      // Текущий авторизованный пользователь
  token: Ref<string | null>;          // JWT токен
  isAuthenticated: ComputedRef<boolean>; // Вычисляемое свойство
  // ...
}
```

---

### 4. Функция checkAuth()

**Вопрос:** Нужна ли функция `checkAuth()`?

**Анализ:**
- В текущем коде `checkAuth()` делает запрос к `/api/user` для проверки токена
- Это полезно для проверки валидности токена и получения данных пользователя

**Решение:** ✅ **Оставить, но переименовать**
- `checkAuth()` → `verifyAuth()` или `fetchUser()`
- Более явное название того, что функция делает
- Или можно разделить на:
  - `verifyToken()` - проверка токена (быстрая проверка)
  - `fetchUser()` - загрузка данных пользователя с сервера

**API:**
```typescript
interface UseAuthReturn {
  // ...
  verifyAuth: () => Promise<boolean>;  // Проверка токена и загрузка пользователя
  fetchUser: () => Promise<User | null>; // Загрузка данных пользователя
  // ...
}
```

---

### 5. Автоматическая инициализация

**Вопрос:** Должен ли плагин автоматически загружать конфигурацию и проверять авторизацию?

**Варианты:**
- **A:** Автоматически при регистрации плагина
- **B:** Вручную через composable в компоненте
- **C:** Гибридный подход (автоматическая загрузка конфигурации, ручная проверка авторизации)

**Решение:** ✅ **Вариант C (Гибридный)**
- Конфигурация загружается автоматически при регистрации плагина
- Проверка авторизации - вручную через `verifyAuth()` в компоненте
- Это дает контроль над моментом проверки (например, после обработки токена из URL)

**Реализация:**
```javascript
// main.js
app.use(createAuthPlugin({
  apiClient,
  configEndpoint: '/api/config',
}));
// Конфигурация загружается автоматически

// App.vue
onMounted(async () => {
  handleTokenFromQuery(); // Обрабатываем токен из URL
  await verifyAuth();     // Проверяем авторизацию
});
```

---

### 6. Обработка ошибок загрузки конфигурации

**Вопрос:** Что делать, если не удалось загрузить конфигурацию?

**Решение:**
- ❌ Не использовать fallback
- ✅ Выбросить ошибку или вернуть null
- ✅ Позволить приложению обработать ошибку явно
- ✅ Можно добавить опцию `onConfigError` callback

**API:**
```typescript
interface AuthPluginOptions {
  // ...
  onConfigError?: (error: Error) => void; // Callback для обработки ошибки загрузки конфигурации
}
```

---

### 7. Состояние загрузки

**Вопрос:** Нужны ли состояния загрузки (loading states)?

**Решение:** ✅ **Да, добавить**
- `isLoadingConfig` - загрузка конфигурации
- `isVerifyingAuth` - проверка авторизации
- `isLoadingUser` - загрузка данных пользователя

**API:**
```typescript
interface UseAuthReturn {
  // ...
  isLoadingConfig: Ref<boolean>;
  isVerifyingAuth: Ref<boolean>;
  isLoadingUser: Ref<boolean>;
  // ...
}
```

---

### 8. Обработка токена из query параметров

**Вопрос:** Должна ли `handleTokenFromQuery()` автоматически вызывать `verifyAuth()`?

**Решение:** ❌ **Нет**
- Разделение ответственности: `handleTokenFromQuery()` только обрабатывает токен
- `verifyAuth()` вызывается отдельно
- Это дает больше контроля

**API:**
```typescript
interface UseAuthReturn {
  // ...
  handleTokenFromQuery: () => { 
    success: boolean; 
    token?: string; 
    error?: string 
  };
  // Не вызывает verifyAuth автоматически
}
```

---

### 9. Типы данных

**Вопрос:** Какие типы использовать для User?

**Решение:**
```typescript
interface User {
  sub: string;           // Subject (ID пользователя)
  name?: string;        // Имя пользователя
  email?: string;       // Email
  role?: string;        // Роль пользователя
  [key: string]: any;   // Дополнительные поля из токена
}
```

---

### 10. Экспорт и структура

**Вопрос:** Что экспортировать из пакета?

**Решение:**
```typescript
// Главный экспорт
export { createAuthPlugin } from './plugin';
export { useAuth } from './composables/useAuth';

// Типы (если TypeScript)
export type { 
  AuthPluginOptions, 
  UseAuthReturn, 
  User 
} from './types';

// Утилиты (опционально, для продвинутого использования)
export { 
  getToken, 
  setToken, 
  removeToken 
} from './auth/token';
```

---

## Финальная спецификация API

### AuthPluginOptions

```typescript
interface AuthPluginOptions {
  // Обязательные
  apiClient: AxiosInstance;        // Axios instance для запросов
  configEndpoint: string;           // Endpoint для загрузки конфигурации (например, '/api/config')
  
  // Опциональные
  tokenKey?: string;                // Ключ для хранения токена в localStorage (по умолчанию 'jwt_token')
  configKey?: string;               // Ключ для хранения конфигурации в sessionStorage (по умолчанию 'auth_config')
  configCacheTTL?: number;          // TTL кэша конфигурации в мс (по умолчанию 5 минут)
  redirectCooldown?: number;        // Cooldown между редиректами в мс (по умолчанию 2 секунды)
  onConfigError?: (error: Error) => void; // Callback для ошибки загрузки конфигурации
}
```

### UseAuthReturn

```typescript
interface UseAuthReturn {
  // Состояние
  currentUser: Ref<User | null>;           // Текущий авторизованный пользователь
  token: Ref<string | null>;               // JWT токен
  config: Ref<AuthConfig | null>;          // Конфигурация авторизации
  isAuthenticated: ComputedRef<boolean>;   // Вычисляемое: авторизован ли пользователь
  
  // Состояния загрузки
  isLoadingConfig: Ref<boolean>;           // Загружается ли конфигурация
  isVerifyingAuth: Ref<boolean>;           // Проверяется ли авторизация
  isLoadingUser: Ref<boolean>;            // Загружаются ли данные пользователя
  
  // Методы авторизации
  login: () => Promise<void>;              // Редирект на авторизацию (алиас для redirectToAuth)
  redirectToAuth: () => Promise<void>;     // Редирект на авторизацию
  logout: () => void;                      // Выход (очистка токена и пользователя)
  
  // Методы проверки и загрузки
  verifyAuth: () => Promise<boolean>;      // Проверка токена и загрузка пользователя
  fetchUser: () => Promise<User | null>;   // Загрузка данных пользователя с сервера
  loadConfig: (force?: boolean) => Promise<AuthConfig>; // Загрузка конфигурации
  
  // Утилиты
  handleTokenFromQuery: () => {            // Обработка токена из URL query параметров
    success: boolean;
    token?: string;
    error?: string;
  };
  clearConfigCache: () => void;            // Очистка кэша конфигурации
}
```

---

## Пример использования (финальный)

```javascript
// main.js
import { createApp } from 'vue';
import { createAuthPlugin } from '@demo/vue-auth-client';
import axios from 'axios';
import App from './App.vue';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

const app = createApp(App);

app.use(createAuthPlugin({
  apiClient,
  configEndpoint: '/api/config',
  // Остальные опции по умолчанию
}));

app.mount('#app');
```

```vue
<!-- App.vue -->
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

// Инициализация при загрузке
onMounted(async () => {
  // Ждем загрузки конфигурации
  if (isLoadingConfig.value) {
    await new Promise(resolve => {
      const unwatch = watch(isLoadingConfig, (loading) => {
        if (!loading) {
          unwatch();
          resolve();
        }
      });
    });
  }
  
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
      <p>Role: {{ currentUser?.role }}</p>
      <button @click="logout">Logout</button>
    </div>
    <div v-else>
      <button @click="login">Login</button>
    </div>
  </div>
</template>
```

---

## Итоговые решения

1. ✅ **fallbackConfig** - убрать, не нужен
2. ✅ **login()** - оставить как алиас для `redirectToAuth()`
3. ✅ **currentUser** - использовать вместо `user`
4. ✅ **verifyAuth()** - переименовать из `checkAuth()`
5. ✅ **Автоматическая загрузка конфигурации** - да, при регистрации плагина
6. ✅ **Ручная проверка авторизации** - да, через `verifyAuth()` в компоненте
7. ✅ **Состояния загрузки** - добавить (`isLoadingConfig`, `isVerifyingAuth`, `isLoadingUser`)
8. ✅ **Обработка ошибок** - явная, через callback `onConfigError`
9. ✅ **handleTokenFromQuery()** - не вызывает `verifyAuth()` автоматически
