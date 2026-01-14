# Варианты выделения Auth Client библиотеки для Vue 3

## Обзор

Данный документ описывает варианты выделения функциональности авторизации (`auth.js` и `interceptors.js`) из `admin-ui` в отдельный переиспользуемый компонент для Vue 3 приложений.

## Текущая структура

### Что нужно выделить:

1. **`auth.js`** - управление токенами и конфигурацией:
   - Управление токенами (getToken, setToken, removeToken, hasToken)
   - Загрузка конфигурации с бэкенда (loadAuthConfig)
   - Кэширование конфигурации
   - Редиректы на авторизацию (redirectToAuth)
   - Обработка токена из query параметров (handleTokenFromQuery)

2. **`interceptors.js`** - Axios interceptors:
   - Request interceptor (добавление JWT токена в заголовки)
   - Response interceptor (обработка 401 ошибок)
   - Защита от множественных редиректов

### Зависимости:

- `axios` - для HTTP запросов
- `localStorage` / `sessionStorage` - для хранения токенов и конфигурации
- `window` - для редиректов
- Vue 3 (для интеграции)

## Варианты реализации

### Вариант 1: Vue 3 Plugin (Рекомендуемый)

**Подход:** Создать Vue 3 Plugin, который регистрируется глобально и предоставляет функциональность через `app.config.globalProperties` и composable.

#### Структура пакета:

```
packages/vue-auth-client/
├── src/
│   ├── index.js              # Главный экспорт (Vue Plugin)
│   ├── plugin.js             # Vue Plugin регистрация
│   ├── composables/
│   │   └── useAuth.js        # Composable для использования в компонентах
│   ├── auth/
│   │   ├── token.js          # Управление токенами
│   │   ├── config.js         # Управление конфигурацией
│   │   └── redirect.js       # Редиректы
│   ├── interceptors/
│   │   └── setup.js          # Настройка Axios interceptors
│   └── utils/
│       └── storage.js        # Абстракция над localStorage/sessionStorage
├── package.json
└── README.md
```

#### Использование:

```javascript
// main.js
import { createApp } from 'vue';
import { createAuthPlugin } from '@demo/vue-auth-client';
import axios from 'axios';

const app = createApp(App);

// Создаем axios instance
const apiClient = axios.create({
  baseURL: '/api',
});

// Регистрируем плагин
app.use(createAuthPlugin({
  apiClient,                    // Axios instance
  configEndpoint: '/api/config', // Endpoint для загрузки конфигурации
  tokenKey: 'jwt_token',        // Ключ для хранения токена
  fallbackConfig: {             // Fallback конфигурация
    providerUrl: 'http://localhost:3000',
    clientId: 'my-app',
  },
}));

app.mount('#app');
```

```vue
<!-- Component.vue -->
<script setup>
import { useAuth } from '@demo/vue-auth-client';

const { 
  user,           // ref с данными пользователя
  isAuthenticated, // computed
  token,          // ref с токеном
  login,          // функция для логина
  logout,         // функция для логаута
  checkAuth,      // функция для проверки авторизации
} = useAuth();

// Использование
onMounted(async () => {
  await checkAuth();
});
</script>
```

#### Преимущества:

- ✅ Глобальная регистрация - один раз настроил, используешь везде
- ✅ Vue 3 нативный подход (Plugin API)
- ✅ Composable для реактивности
- ✅ Автоматическая настройка interceptors
- ✅ Типизация через TypeScript (если добавить)

#### Недостатки:

- ⚠️ Зависимость от Vue 3
- ⚠️ Нужно передавать axios instance при инициализации

---

### Вариант 2: Composable Only (useAuth)

**Подход:** Создать только composable без Vue Plugin, более легковесный вариант.

#### Структура пакета:

```
packages/vue-auth-client/
├── src/
│   ├── index.js              # Главный экспорт
│   ├── composables/
│   │   └── useAuth.js        # Composable
│   ├── auth/
│   │   ├── token.js
│   │   ├── config.js
│   │   └── redirect.js
│   ├── interceptors/
│   │   └── setup.js
│   └── utils/
│       └── storage.js
├── package.json
└── README.md
```

#### Использование:

```javascript
// main.js
import { createApp } from 'vue';
import { setupAuth } from '@demo/vue-auth-client';
import axios from 'axios';

const app = createApp(App);

const apiClient = axios.create({
  baseURL: '/api',
});

// Настраиваем auth (не Vue Plugin)
setupAuth({
  apiClient,
  configEndpoint: '/api/config',
  tokenKey: 'jwt_token',
});

app.mount('#app');
```

```vue
<!-- Component.vue -->
<script setup>
import { useAuth } from '@demo/vue-auth-client';

const auth = useAuth();
// Использование как в варианте 1
</script>
```

#### Преимущества:

- ✅ Легковесный (нет Vue Plugin overhead)
- ✅ Проще в использовании
- ✅ Меньше магии

#### Недостатки:

- ⚠️ Нужно вызывать setupAuth вручную
- ⚠️ Меньше автоматизации

---

### Вариант 3: Standalone Library (Без Vue зависимостей)

**Подход:** Создать библиотеку без зависимостей от Vue, только функции и классы.

#### Структура пакета:

```
packages/auth-client/
├── src/
│   ├── index.js              # Главный экспорт
│   ├── AuthClient.js          # Класс AuthClient
│   ├── auth/
│   │   ├── token.js
│   │   ├── config.js
│   │   └── redirect.js
│   ├── interceptors/
│   │   └── setup.js
│   └── utils/
│       └── storage.js
├── package.json
└── README.md
```

#### Использование:

```javascript
// main.js
import { AuthClient } from '@demo/auth-client';
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
});

// Создаем экземпляр
const authClient = new AuthClient({
  apiClient,
  configEndpoint: '/api/config',
  tokenKey: 'jwt_token',
});

// Настраиваем interceptors
authClient.setupInterceptors();

// Экспортируем для использования в компонентах
window.authClient = authClient;
```

```vue
<!-- Component.vue -->
<script setup>
import { ref, onMounted } from 'vue';

const user = ref(null);

onMounted(async () => {
  const token = window.authClient.getToken();
  if (token) {
    try {
      const response = await apiClient.get('/user');
      user.value = response.data.user;
    } catch (err) {
      // Обработка ошибки
    }
  }
});
</script>
```

#### Преимущества:

- ✅ Нет зависимостей от Vue
- ✅ Можно использовать в любом фреймворке (React, Angular, Vanilla JS)
- ✅ Проще тестировать

#### Недостатки:

- ⚠️ Нет реактивности из коробки
- ⚠️ Нужно вручную управлять состоянием
- ⚠️ Меньше интеграции с Vue экосистемой

---

### Вариант 4: Hybrid (Library + Vue Composable)

**Подход:** Создать базовую библиотеку без Vue зависимостей + Vue composable обертку.

#### Структура пакета:

```
packages/auth-client/
├── src/
│   ├── index.js              # Экспорт библиотеки
│   ├── AuthClient.js         # Базовый класс (без Vue)
│   ├── auth/
│   │   ├── token.js
│   │   ├── config.js
│   │   └── redirect.js
│   ├── interceptors/
│   │   └── setup.js
│   └── utils/
│       └── storage.js
├── vue/
│   ├── index.js              # Vue специфичный экспорт
│   └── composables/
│       └── useAuth.js        # Composable обертка
├── package.json
└── README.md
```

#### Использование:

```javascript
// Для Vue приложений
import { useAuth } from '@demo/auth-client/vue';

// Для других фреймворков
import { AuthClient } from '@demo/auth-client';
```

#### Преимущества:

- ✅ Универсальность (работает везде)
- ✅ Vue интеграция через composable
- ✅ Лучшее из обоих миров

#### Недостатки:

- ⚠️ Более сложная структура
- ⚠️ Больше кода для поддержки

---

## Рекомендация: Вариант 1 (Vue 3 Plugin)

### Обоснование:

1. **Нативная интеграция с Vue 3** - использует официальный Plugin API
2. **Реактивность из коробки** - composable автоматически обновляет состояние
3. **Простота использования** - один раз настроил, используешь везде
4. **Автоматизация** - interceptors настраиваются автоматически
5. **Типизация** - легко добавить TypeScript поддержку

### Детальная структура (Вариант 1):

```
packages/vue-auth-client/
├── src/
│   ├── index.js                    # Главный экспорт
│   │
│   ├── plugin.js                   # Vue Plugin
│   │   export function createAuthPlugin(options)
│   │
│   ├── composables/
│   │   └── useAuth.js              # Composable
│   │       export function useAuth()
│   │       - user: ref(null)
│   │       - isAuthenticated: computed
│   │       - token: ref(null)
│   │       - login()
│   │       - logout()
│   │       - checkAuth()
│   │       - loadConfig()
│   │
│   ├── auth/
│   │   ├── token.js                # Управление токенами
│   │   │   - getToken()
│   │   │   - setToken(token)
│   │   │   - removeToken()
│   │   │   - hasToken()
│   │   │
│   │   ├── config.js               # Управление конфигурацией
│   │   │   - loadAuthConfig()
│   │   │   - clearAuthConfigCache()
│   │   │   - getAuthConfigSync()
│   │   │
│   │   └── redirect.js             # Редиректы
│   │       - redirectToAuth()
│   │       - handleTokenFromQuery()
│   │
│   ├── interceptors/
│   │   └── setup.js                # Настройка interceptors
│   │       - setupRequestInterceptor(apiClient, getToken)
│   │       - setupResponseInterceptor(apiClient, redirectToAuth, removeToken)
│   │
│   └── utils/
│       └── storage.js              # Абстракция хранилища
│           - getItem(key)
│           - setItem(key, value)
│           - removeItem(key)
│
├── package.json
├── README.md
└── tsconfig.json (опционально)
```

### API дизайн:

```typescript
// Типы (опционально, если добавить TypeScript)
interface AuthConfig {
  providerUrl: string;
  clientId: string;
}

interface AuthPluginOptions {
  apiClient: AxiosInstance;
  configEndpoint?: string;
  tokenKey?: string;
  configKey?: string;
  configCacheTTL?: number;
  fallbackConfig?: AuthConfig;
  redirectCooldown?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  config: AuthConfig | null;
}

interface UseAuthReturn {
  user: Ref<User | null>;
  token: Ref<string | null>;
  isAuthenticated: ComputedRef<boolean>;
  config: Ref<AuthConfig | null>;
  login: () => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  loadConfig: (force?: boolean) => Promise<AuthConfig>;
  handleTokenFromQuery: () => { success: boolean; token?: string; error?: string };
}
```

### Пример полного использования:

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
  tokenKey: 'jwt_token',
  configKey: 'auth_config',
  configCacheTTL: 5 * 60 * 1000, // 5 минут
  fallbackConfig: {
    providerUrl: 'http://localhost:3000',
    clientId: 'my-app',
  },
  redirectCooldown: 2000, // 2 секунды
}));

app.mount('#app');
```

```vue
<!-- App.vue -->
<script setup>
import { onMounted } from 'vue';
import { useAuth } from '@demo/vue-auth-client';
import { api } from './api'; // Ваш api client

const { user, isAuthenticated, checkAuth, handleTokenFromQuery } = useAuth();

// Инициализация при загрузке
onMounted(async () => {
  // Обрабатываем токен из query параметров (если есть)
  handleTokenFromQuery();
  
  // Проверяем авторизацию
  await checkAuth();
});
</script>

<template>
  <div>
    <div v-if="isAuthenticated">
      <p>Welcome, {{ user?.name }}!</p>
      <button @click="logout">Logout</button>
    </div>
    <div v-else>
      <button @click="login">Login</button>
    </div>
  </div>
</template>
```

---

## Соображения по реализации

### 1. Управление состоянием

**Вариант A: Singleton (текущий подход)**
- Один экземпляр на приложение
- Состояние хранится в модуле
- Простота использования

**Вариант B: Instance-based**
- Можно создать несколько экземпляров
- Больше гибкости
- Сложнее в использовании

**Рекомендация:** Вариант A для большинства случаев, но поддержать возможность создания нескольких экземпляров через опции.

### 2. Хранение токенов

**Текущий подход:** `localStorage`
- ✅ Сохраняется между сессиями
- ⚠️ Уязвимость к XSS

**Альтернативы:**
- `sessionStorage` - очищается при закрытии вкладки
- `httpOnly cookies` - требует backend поддержки
- `memory` - только для текущей сессии

**Рекомендация:** Поддержать все варианты через опции, по умолчанию `localStorage`.

### 3. Конфигурация

**Текущий подход:** Загрузка с бэкенда через `/api/config`
- ✅ Централизованная конфигурация
- ✅ Не нужно пересобирать фронтенд

**Альтернативы:**
- Хардкод в коде
- Переменные окружения
- Конфигурационный файл

**Рекомендация:** Поддержать все варианты, приоритет:
1. Загрузка с бэкенда (если указан `configEndpoint`)
2. Переменные окружения
3. Fallback конфигурация

### 4. Обработка ошибок

**Текущий подход:** Автоматический редирект на 401
- ✅ Простота использования
- ⚠️ Может быть нежелательным в некоторых случаях

**Рекомендация:** Добавить опции:
- `autoRedirectOn401: boolean` - автоматический редирект
- `on401Error: (error) => void` - кастомный обработчик

### 5. Типизация

**Рекомендация:** Добавить TypeScript поддержку:
- `.d.ts` файлы для типов
- Полная типизация API
- Типы для Vue composable

---

## Миграция из текущего кода

### Шаг 1: Создать структуру пакета

```bash
mkdir -p packages/vue-auth-client/src/{composables,auth,interceptors,utils}
```

### Шаг 2: Перенести код

1. `auth.js` → разделить на:
   - `auth/token.js` - управление токенами
   - `auth/config.js` - управление конфигурацией
   - `auth/redirect.js` - редиректы

2. `interceptors.js` → `interceptors/setup.js`

3. Создать `composables/useAuth.js` - обертка с реактивностью

4. Создать `plugin.js` - Vue Plugin регистрация

### Шаг 3: Обновить admin-ui

```javascript
// main.js
import { createAuthPlugin } from '@demo/vue-auth-client';

app.use(createAuthPlugin({ ... }));
```

```vue
<!-- App.vue -->
<script setup>
import { useAuth } from '@demo/vue-auth-client';

const { user, isAuthenticated, checkAuth } = useAuth();
</script>
```

---

## Дополнительные возможности

### 1. Поддержка refresh tokens

```typescript
interface AuthPluginOptions {
  // ...
  refreshTokenKey?: string;
  refreshTokenEndpoint?: string;
  onTokenRefresh?: (newToken: string) => void;
}
```

### 2. Поддержка multiple providers

```typescript
interface AuthPluginOptions {
  // ...
  providers?: {
    [key: string]: AuthConfig;
  };
  defaultProvider?: string;
}
```

### 3. Middleware для Vue Router

```typescript
import { createAuthGuard } from '@demo/vue-auth-client';

router.beforeEach(createAuthGuard({
  requireAuth: true,
  redirectTo: '/login',
}));
```

### 4. DevTools интеграция

```typescript
// Vue DevTools покажет состояние auth
const authState = useAuth();
// В DevTools будет видно: user, token, isAuthenticated
```

---

## Заключение

**Рекомендуемый подход:** Вариант 1 (Vue 3 Plugin) с поддержкой:
- ✅ Vue 3 Plugin для глобальной регистрации
- ✅ Composable для реактивности
- ✅ Автоматическая настройка interceptors
- ✅ Гибкая конфигурация
- ✅ TypeScript поддержка (опционально)
- ✅ Расширяемость для будущих фич

Этот подход обеспечивает:
- Простоту использования
- Нативную интеграцию с Vue 3
- Переиспользуемость
- Гибкость конфигурации
- Легкую миграцию из текущего кода
