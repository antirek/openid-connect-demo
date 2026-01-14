// Auth utility - единая точка контроля и работы с токенами

import axios from 'axios';

const TOKEN_KEY = 'jwt_token';
const CONFIG_KEY = 'auth_config';
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Кэш конфигурации
let configCache = null;
let configLoadPromise = null;

// ========== Управление токенами ==========

/**
 * Получение токена из хранилища
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Сохранение токена в хранилище
 */
export function setToken(token) {
  if (!token) {
    console.warn('setToken: Attempting to set empty token');
    return false;
  }
  
  localStorage.setItem(TOKEN_KEY, token);
  
  // Проверяем, что токен действительно сохранен
  const savedToken = localStorage.getItem(TOKEN_KEY);
  if (savedToken !== token) {
    console.error('setToken: Token was not saved correctly!', {
      originalLength: token.length,
      savedLength: savedToken?.length,
    });
    return false;
  }
  
  return true;
}

/**
 * Удаление токена из хранилища
 */
export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Проверка наличия токена
 */
export function hasToken() {
  return !!getToken();
}

// ========== Конфигурация ==========

/**
 * Очистка кэша конфигурации (для отладки)
 */
export function clearAuthConfigCache() {
  configCache = null;
  configLoadPromise = null;
  sessionStorage.removeItem(CONFIG_KEY);
  console.log('Auth config cache cleared');
}

/**
 * Загрузка конфигурации авторизации с бэкенда
 * Использует кэш для избежания повторных запросов
 * @param {boolean} force - принудительная перезагрузка (игнорирует кэш)
 */
export async function loadAuthConfig(force = false) {
  // Если принудительная перезагрузка, очищаем кэш
  if (force) {
    clearAuthConfigCache();
  }
  // Если уже загружается, возвращаем существующий промис
  if (configLoadPromise) {
    console.log('Auth config: Already loading, waiting for existing promise');
    return configLoadPromise;
  }

  // Проверяем кэш в памяти
  if (configCache) {
    const now = Date.now();
    if (now - configCache.timestamp < CONFIG_CACHE_TTL) {
      console.log('Auth config: Using in-memory cache');
      return configCache.config;
    } else {
      console.log('Auth config: In-memory cache expired, clearing');
      configCache = null;
    }
  }

  // Проверяем кэш в sessionStorage
  try {
    const cached = sessionStorage.getItem(CONFIG_KEY);
    if (cached) {
      const cachedData = JSON.parse(cached);
      const now = Date.now();
      if (now - cachedData.timestamp < CONFIG_CACHE_TTL) {
        console.log('Auth config: Using sessionStorage cache');
        configCache = cachedData;
        return cachedData.config;
      } else {
        console.log('Auth config: SessionStorage cache expired, clearing');
        sessionStorage.removeItem(CONFIG_KEY);
      }
    }
  } catch (e) {
    console.warn('Failed to read config from cache:', e);
  }

  // Загружаем конфигурацию с бэкенда
  console.log('Auth config: Loading from backend...');
  configLoadPromise = (async () => {
    try {
      // Используем axios напрямую, чтобы избежать циклических зависимостей
      // (interceptors могут использовать auth.js)
      const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
      const configUrl = `${API_BASE_URL}/config`;
      console.log('Auth config: Making request to', configUrl);
      
      const response = await axios.get(configUrl, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('Auth config: Response received', response.data);

      const config = {
        providerUrl: response.data.providerUrl,
        clientId: response.data.clientId,
      };

      // Сохраняем в кэш
      const cacheData = {
        config,
        timestamp: Date.now(),
      };
      configCache = cacheData;
      sessionStorage.setItem(CONFIG_KEY, JSON.stringify(cacheData));

      console.log('Auth config: Successfully loaded from backend:', config);
      return config;
    } catch (error) {
      console.error('Auth config: Failed to load from backend:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url,
      });
      // В случае ошибки используем значения по умолчанию
      const fallbackConfig = {
        providerUrl: 'http://localhost:3000',
        clientId: 'admin-ui',
      };
      configCache = {
        config: fallbackConfig,
        timestamp: Date.now(),
      };
      return fallbackConfig;
    } finally {
      configLoadPromise = null;
    }
  })();

  return configLoadPromise;
}

/**
 * Получение конфигурации авторизации (синхронно, если уже загружена)
 */
function getAuthConfigSync() {
  if (configCache) {
    return configCache.config;
  }

  // Пытаемся загрузить из sessionStorage
  try {
    const cached = sessionStorage.getItem(CONFIG_KEY);
    if (cached) {
      const cachedData = JSON.parse(cached);
      const now = Date.now();
      if (now - cachedData.timestamp < CONFIG_CACHE_TTL) {
        configCache = cachedData;
        return cachedData.config;
      }
    }
  } catch (e) {
    // Игнорируем ошибки
  }

  return null;
}

// ========== Авторизация и редиректы ==========

/**
 * Редирект на страницу авторизации
 * Сохраняет текущий URL для возврата после авторизации
 */
export async function redirectToAuth() {
  // Загружаем конфигурацию
  const config = await loadAuthConfig();
  
  // Сохраняем текущий URL для возврата после авторизации
  const returnUrl = window.location.pathname;
  sessionStorage.setItem('return_url', returnUrl);
  
  // Редиректим на auth с client_id
  const authUrl = `${config.providerUrl}/client/auth?client_id=${config.clientId}`;
  window.location.href = authUrl;
}

/**
 * Обработка токена из query параметров
 * Сохраняет токен в localStorage и очищает URL
 */
export function handleTokenFromQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (!token) {
    return { success: false };
  }
  
  console.log('Token received from query, saving to localStorage', {
    tokenLength: token.length,
    tokenStart: token.substring(0, 20) + '...',
  });
  
  // Сохраняем токен через централизованную функцию
  const saved = setToken(token);
  if (!saved) {
    return { success: false, error: 'Token save failed' };
  }
  
  console.log('Token saved successfully to localStorage');
  
  // Очищаем URL от токена
  const returnUrl = sessionStorage.getItem('return_url') || '/';
  sessionStorage.removeItem('return_url');
  
  // Убираем token из URL
  const cleanUrl = returnUrl.split('?')[0];
  window.history.replaceState({}, document.title, cleanUrl);
  
  console.log('URL cleaned, ready for API calls');
  return { success: true, token };
}
