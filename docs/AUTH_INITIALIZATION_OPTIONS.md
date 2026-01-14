# Варианты упрощения инициализации авторизации

## Текущая ситуация

В `App.vue` есть код инициализации (строки 127-152):

```javascript
onMounted(async () => {
  // Ждем загрузки конфигурации (если еще загружается)
  if (isLoadingConfig.value) {
    await new Promise((resolve) => {
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
  try {
    await verifyAuth();
    if (isAuthenticated.value) {
      // Загружаем защищенные данные
      fetchProtectedData();
    }
  } catch (err) {
    console.error('App: Auth verification failed:', err);
    // Interceptor обработает 401 и сделает редирект
  }
});
```

## Варианты решения

### Вариант 1: Метод `initialize()` в composable (Рекомендуемый)

**Подход:** Добавить метод `initialize()` в `useAuth()`, который инкапсулирует всю логику инициализации.

**Преимущества:**
- ✅ Вся логика в одном месте
- ✅ Переиспользуемый в любом компоненте
- ✅ Простое использование: `await initialize()`
- ✅ Возвращает результат (авторизован ли пользователь)

**Реализация:**

```javascript
// В plugin.js
const initialize = async () => {
  // Ждем загрузки конфигурации
  if (isLoadingConfig.value) {
    await new Promise((resolve) => {
      const unwatch = watch(isLoadingConfig, (loading) => {
        if (!loading) {
          unwatch();
          resolve();
        }
      });
    });
  }
  
  // Обрабатываем токен из query параметров
  handleTokenFromQuery();
  
  // Проверяем авторизацию
  try {
    const authenticated = await verifyAuth();
    return { authenticated, user: currentUser.value };
  } catch (err) {
    console.error('Auth initialization failed:', err);
    return { authenticated: false, user: null, error: err };
  }
};
```

**Использование в App.vue:**

```vue
<script setup>
import { onMounted } from 'vue';
import { useAuth } from 'stork-vue-auth-client';
import { apiClient } from './apiClient.js';

const { initialize, isAuthenticated } = useAuth();

// Инициализация приложения
onMounted(async () => {
  const { authenticated } = await initialize();
  
  if (authenticated) {
    // Загружаем защищенные данные (специфично для App.vue)
    fetchProtectedData();
  }
});
</script>
```

---

### Вариант 2: Опция `autoInitialize` в плагине

**Подход:** Добавить опцию `autoInitialize: boolean` в плагин, которая автоматически выполняет инициализацию при монтировании приложения.

**Преимущества:**
- ✅ Автоматическая инициализация
- ✅ Не нужно вызывать вручную
- ✅ Минимум кода в компонентах

**Недостатки:**
- ⚠️ Меньше контроля над моментом инициализации
- ⚠️ Сложнее обработать специфичную логику (например, `fetchProtectedData()`)

**Реализация:**

```javascript
// В plugin.js
export function createAuthPlugin(options) {
  const { autoInitialize = false, onInitialized } = options;
  
  // ... существующий код ...
  
  // Автоматическая инициализация
  if (autoInitialize) {
    // Используем nextTick или setTimeout для выполнения после монтирования
    Promise.resolve().then(async () => {
      await initialize();
      if (onInitialized) {
        onInitialized({ authenticated: isAuthenticated.value, user: currentUser.value });
      }
    });
  }
}
```

**Использование:**

```javascript
// main.js
app.use(createAuthPlugin({
  apiClient,
  configEndpoint: '/api/config',
  autoInitialize: true,
  onInitialized: ({ authenticated }) => {
    if (authenticated) {
      // Можно вызвать специфичную логику
    }
  },
}));
```

---

### Вариант 3: Функция-хелпер в composable

**Подход:** Создать функцию `initializeAuth()` в composable, которая возвращает промис.

**Преимущества:**
- ✅ Простое использование
- ✅ Можно использовать в любом компоненте
- ✅ Гибкость

**Реализация:**

```javascript
// В composables/useAuth.js
export function useAuth() {
  const authInstance = getAuthInstance();
  
  const initializeAuth = async () => {
    // Ждем конфигурации
    if (authInstance.isLoadingConfig.value) {
      await new Promise((resolve) => {
        const unwatch = watch(authInstance.isLoadingConfig, (loading) => {
          if (!loading) {
            unwatch();
            resolve();
          }
        });
      });
    }
    
    // Обрабатываем токен
    authInstance.handleTokenFromQuery();
    
    // Проверяем авторизацию
    try {
      await authInstance.verifyAuth();
      return { success: true, authenticated: !!authInstance.currentUser.value };
    } catch (err) {
      return { success: false, authenticated: false, error: err };
    }
  };
  
  return {
    // ... существующие методы ...
    initializeAuth,
  };
}
```

**Использование:**

```vue
<script setup>
onMounted(async () => {
  const { authenticated } = await initializeAuth();
  if (authenticated) {
    fetchProtectedData();
  }
});
</script>
```

---

### Вариант 4: Комбинация: `initialize()` + опциональный callback

**Подход:** Метод `initialize()` с опциональным callback для специфичной логики.

**Преимущества:**
- ✅ Гибкость
- ✅ Можно передать callback для специфичной логики
- ✅ Или использовать результат для условной логики

**Реализация:**

```javascript
// В plugin.js
const initialize = async (onAuthenticated) => {
  // Ждем конфигурации
  if (isLoadingConfig.value) {
    await new Promise((resolve) => {
      const unwatch = watch(isLoadingConfig, (loading) => {
        if (!loading) {
          unwatch();
          resolve();
        }
      });
    });
  }
  
  // Обрабатываем токен
  handleTokenFromQuery();
  
  // Проверяем авторизацию
  try {
    const authenticated = await verifyAuth();
    if (authenticated && onAuthenticated) {
      onAuthenticated(currentUser.value);
    }
    return { authenticated, user: currentUser.value };
  } catch (err) {
    return { authenticated: false, user: null, error: err };
  }
};
```

**Использование:**

```vue
<script setup>
onMounted(async () => {
  await initialize((user) => {
    // Callback вызывается только если пользователь авторизован
    fetchProtectedData();
  });
});
</script>
```

---

## Рекомендация: Вариант 1 (Метод `initialize()`)

**Обоснование:**
- Простое и понятное API
- Переиспользуемый в любом компоненте
- Возвращает результат для условной логики
- Не требует изменений в плагине (только добавление метода)

**Финальный API:**

```typescript
interface UseAuthReturn {
  // ... существующие методы ...
  initialize: () => Promise<{
    authenticated: boolean;
    user: User | null;
    error?: Error;
  }>;
}
```

**Использование:**

```vue
<script setup>
import { onMounted } from 'vue';
import { useAuth } from 'stork-vue-auth-client';

const { initialize } = useAuth();

onMounted(async () => {
  const { authenticated } = await initialize();
  if (authenticated) {
    // Специфичная логика приложения
    fetchProtectedData();
  }
});
</script>
```

---

## Альтернатива: Упростить без изменений в плагине

Если не хотите менять плагин, можно создать локальную функцию в `App.vue`:

```vue
<script setup>
// ... existing code ...

async function initializeAuth() {
  // Ждем конфигурации
  if (isLoadingConfig.value) {
    await new Promise((resolve) => {
      const unwatch = watch(isLoadingConfig, (loading) => {
        if (!loading) {
          unwatch();
          resolve();
        }
      });
    });
  }
  
  handleTokenFromQuery();
  await verifyAuth();
}

onMounted(async () => {
  await initializeAuth();
  if (isAuthenticated.value) {
    fetchProtectedData();
  }
});
</script>
```

Это уже упрощает код, но лучше вынести в плагин для переиспользования.
