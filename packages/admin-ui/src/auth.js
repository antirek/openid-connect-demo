// Auth utility - единая точка контроля и работы с токенами

const TOKEN_KEY = 'jwt_token';
const PROVIDER_URL = 'http://localhost:3000';
const CLIENT_ID = 'admin-ui';

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

// ========== Авторизация и редиректы ==========

/**
 * Редирект на страницу авторизации
 * Сохраняет текущий URL для возврата после авторизации
 */
export function redirectToAuth() {
  // Сохраняем текущий URL для возврата после авторизации
  const returnUrl = window.location.pathname;
  sessionStorage.setItem('return_url', returnUrl);
  
  // Редиректим на auth с client_id
  const authUrl = `${PROVIDER_URL}/client/auth?client_id=${CLIENT_ID}`;
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
