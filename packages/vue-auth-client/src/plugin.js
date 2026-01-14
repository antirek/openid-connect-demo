// Vue 3 Plugin для авторизации

import { ref, watch } from 'vue';
import { createTokenManager } from './auth/token.js';
import { createConfigManager } from './auth/config.js';
import { createRedirectManager } from './auth/redirect.js';
import { setupRequestInterceptor, setupResponseInterceptor } from './interceptors/setup.js';
import { setAuthInstance } from './composables/useAuth.js';

export function createAuthPlugin(options) {
  const {
    apiClient,
    configEndpoint,
    tokenKey = 'jwt_token',
    configKey = 'auth_config',
    configCacheTTL = 5 * 60 * 1000,
    redirectCooldown = 2000,
    onConfigError,
  } = options;

  // Создаем менеджеры
  const tokenManager = createTokenManager(tokenKey);
  const configManager = createConfigManager(
    apiClient,
    configEndpoint,
    configKey,
    configCacheTTL,
    onConfigError
  );
  const redirectManager = createRedirectManager(configManager.loadConfig);

  // Реактивное состояние
  const currentUser = ref(null);
  const token = ref(null);
  const config = ref(null);
  const isLoadingConfig = ref(false);
  const isVerifyingAuth = ref(false);
  const isLoadingUser = ref(false);

  // Синхронизируем token с localStorage
  const updateTokenFromStorage = () => {
    const storedToken = tokenManager.getToken();
    token.value = storedToken;
  };

  // Инициализация: загружаем токен из хранилища
  updateTokenFromStorage();

  // Загрузка конфигурации
  const loadConfig = async (force = false) => {
    isLoadingConfig.value = true;
    try {
      const loadedConfig = await configManager.loadConfig(force);
      config.value = loadedConfig;
      return loadedConfig;
    } catch (error) {
      console.error('Failed to load auth config:', error);
      throw error;
    } finally {
      isLoadingConfig.value = false;
    }
  };

  // Проверка авторизации и загрузка пользователя
  const verifyAuth = async () => {
    isVerifyingAuth.value = true;
    try {
      updateTokenFromStorage();
      
      if (!token.value) {
        currentUser.value = null;
        return false;
      }
      
      try {
        const response = await apiClient.get('/user');
        currentUser.value = response.user;
        return true;
      } catch (err) {
        // Interceptor обработает 401 и сделает редирект
        currentUser.value = null;
        throw err;
      }
    } finally {
      isVerifyingAuth.value = false;
    }
  };

  // Загрузка данных пользователя
  const fetchUser = async () => {
    isLoadingUser.value = true;
    try {
      const response = await apiClient.get('/user');
      currentUser.value = response.user;
      return response.user;
    } catch (err) {
      currentUser.value = null;
      throw err;
    } finally {
      isLoadingUser.value = false;
    }
  };

  // Редирект на авторизацию
  const redirectToAuth = async () => {
    await redirectManager.redirectToAuth();
  };

  // Login (алиас для redirectToAuth)
  const login = redirectToAuth;

  // Logout
  const logout = () => {
    tokenManager.removeToken();
    token.value = null;
    currentUser.value = null;
  };

  // Обработка токена из query параметров
  const handleTokenFromQuery = () => {
    const result = redirectManager.handleTokenFromQuery(tokenManager.setToken);
    if (result.success) {
      updateTokenFromStorage();
    }
    return result;
  };

  // Очистка кэша конфигурации
  const clearConfigCache = () => {
    configManager.clearConfigCache();
    config.value = null;
  };

  // Инициализация авторизации (ожидание конфигурации, обработка токена, проверка авторизации)
  const initialize = async () => {
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
      const authenticated = await verifyAuth();
      return { 
        authenticated, 
        user: currentUser.value,
        error: null,
      };
    } catch (err) {
      console.error('Auth initialization failed:', err);
      return { 
        authenticated: false, 
        user: null,
        error: err,
      };
    }
  };

  // Настраиваем interceptors
  // Используем функции, чтобы всегда получать актуальное значение токена
  setupRequestInterceptor(apiClient, () => tokenManager.getToken());
  setupResponseInterceptor(
    apiClient,
    redirectToAuth,
    () => {
      tokenManager.removeToken();
      token.value = null;
    },
    redirectCooldown,
    () => tokenManager.getToken()
  );

  // Создаем экземпляр auth для composable
  const authInstance = {
    currentUser,
    token,
    config,
    isLoadingConfig,
    isVerifyingAuth,
    isLoadingUser,
    login,
    redirectToAuth,
    logout,
    verifyAuth,
    fetchUser,
    loadConfig,
    handleTokenFromQuery,
    clearConfigCache,
    initialize,
  };

  // Сохраняем экземпляр для composable
  setAuthInstance(authInstance);

  // Загружаем конфигурацию автоматически при регистрации плагина
  loadConfig().catch((error) => {
    console.error('Failed to load auth config on plugin initialization:', error);
    if (onConfigError) {
      onConfigError(error);
    }
  });

  // Возвращаем Vue Plugin
  return {
    install(app) {
      // Плагин уже настроен выше
      // Можно добавить глобальные свойства, если нужно
      app.config.globalProperties.$auth = authInstance;
    },
  };
}
