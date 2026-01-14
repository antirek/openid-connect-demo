// Управление конфигурацией авторизации

import { getItem, setItem, removeItem } from '../utils/storage.js';

export function createConfigManager(apiClient, configEndpoint, configKey = 'auth_config', configCacheTTL = 5 * 60 * 1000, onConfigError) {
  // Кэш конфигурации
  let configCache = null;
  let configLoadPromise = null;

  /**
   * Очистка кэша конфигурации
   */
  function clearConfigCache() {
    configCache = null;
    configLoadPromise = null;
    removeItem(configKey, sessionStorage);
    console.log('Auth config cache cleared');
  }

  /**
   * Получение конфигурации авторизации (синхронно, если уже загружена)
   */
  function getConfigSync() {
    if (configCache) {
      return configCache.config;
    }

    // Пытаемся загрузить из sessionStorage
    try {
      const cached = getItem(configKey, sessionStorage);
      if (cached) {
        const cachedData = JSON.parse(cached);
        const now = Date.now();
        if (now - cachedData.timestamp < configCacheTTL) {
          configCache = cachedData;
          return cachedData.config;
        }
      }
    } catch (e) {
      // Игнорируем ошибки
    }

    return null;
  }

  /**
   * Загрузка конфигурации авторизации с бэкенда
   * Использует кэш для избежания повторных запросов
   */
  async function loadConfig(force = false) {
    // Если принудительная перезагрузка, очищаем кэш
    if (force) {
      clearConfigCache();
    }

    // Если уже загружается, возвращаем существующий промис
    if (configLoadPromise) {
      console.log('Auth config: Already loading, waiting for existing promise');
      return configLoadPromise;
    }

    // Проверяем кэш в памяти
    if (configCache) {
      const now = Date.now();
      if (now - configCache.timestamp < configCacheTTL) {
        console.log('Auth config: Using in-memory cache');
        return configCache.config;
      } else {
        console.log('Auth config: In-memory cache expired, clearing');
        configCache = null;
      }
    }

    // Проверяем кэш в sessionStorage
    try {
      const cached = getItem(configKey, sessionStorage);
      if (cached) {
        const cachedData = JSON.parse(cached);
        const now = Date.now();
        if (now - cachedData.timestamp < configCacheTTL) {
          console.log('Auth config: Using sessionStorage cache');
          configCache = cachedData;
          return cachedData.config;
        } else {
          console.log('Auth config: SessionStorage cache expired, clearing');
          removeItem(configKey, sessionStorage);
        }
      }
    } catch (e) {
      console.warn('Failed to read config from cache:', e);
    }

    // Загружаем конфигурацию с бэкенда
    console.log('Auth config: Loading from backend...');
    configLoadPromise = (async () => {
      try {
        // Убираем /api из начала, если есть, так как apiClient уже имеет baseURL: '/api'
        const endpoint = configEndpoint.startsWith('/api/') 
          ? configEndpoint.substring(4)  // Убираем '/api'
          : configEndpoint.startsWith('/')
          ? configEndpoint.substring(1)  // Убираем '/'
          : configEndpoint;
        
        console.log('Auth config: Making request to endpoint:', endpoint);
        const response = await apiClient.get(endpoint);
        console.log('Auth config: Response received', response);

        // Response interceptor уже вернул response.data, поэтому response - это уже данные
        const data = response.data || response;
        
        const config = {
          providerUrl: data.providerUrl,
          clientId: data.clientId,
        };

        // Сохраняем в кэш
        const cacheData = {
          config,
          timestamp: Date.now(),
        };
        configCache = cacheData;
        setItem(configKey, JSON.stringify(cacheData), sessionStorage);

        console.log('Auth config: Successfully loaded from backend:', config);
        return config;
      } catch (error) {
        console.error('Auth config: Failed to load from backend:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url,
        });
        
        // Вызываем callback для обработки ошибки
        if (onConfigError) {
          onConfigError(error);
        }
        
        // Выбрасываем ошибку (без fallback)
        throw error;
      } finally {
        configLoadPromise = null;
      }
    })();

    return configLoadPromise;
  }

  return {
    loadConfig,
    clearConfigCache,
    getConfigSync,
  };
}
