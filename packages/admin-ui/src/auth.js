// Auth utility для обработки авторизации и редиректов

const PROVIDER_URL = 'http://localhost:3000';
const CLIENT_ID = 'admin-ui';

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
  
  if (token) {
    console.log('Token received from query, saving to localStorage');
    
    // Сохраняем токен
    localStorage.setItem('jwt_token', token);
    
    // Проверяем, что токен действительно сохранен
    const savedToken = localStorage.getItem('jwt_token');
    if (savedToken !== token) {
      console.error('Token was not saved correctly!');
      return { success: false, error: 'Token save failed' };
    }
    
    // Очищаем URL от токена
    const returnUrl = sessionStorage.getItem('return_url') || '/';
    sessionStorage.removeItem('return_url');
    
    // Убираем token из URL
    const cleanUrl = returnUrl.split('?')[0];
    window.history.replaceState({}, document.title, cleanUrl);
    
    console.log('Token saved successfully, URL cleaned');
    return { success: true, token };
  }
  
  return { success: false };
}

/**
 * Проверка наличия токена
 */
export function hasToken() {
  return !!localStorage.getItem('jwt_token');
}

/**
 * Получение токена
 */
export function getToken() {
  return localStorage.getItem('jwt_token');
}

/**
 * Удаление токена
 */
export function removeToken() {
  localStorage.removeItem('jwt_token');
}
