// Редиректы на авторизацию

import { getItem, setItem, removeItem } from '../utils/storage.js';

export function createRedirectManager(loadConfig) {
  /**
   * Редирект на страницу авторизации
   * Сохраняет текущий URL для возврата после авторизации
   */
  async function redirectToAuth() {
    // Загружаем конфигурацию
    const config = await loadConfig();
    
    // Сохраняем текущий URL для возврата после авторизации
    const returnUrl = window.location.pathname;
    setItem('return_url', returnUrl, sessionStorage);
    
    // Редиректим на auth с client_id
    const authUrl = `${config.providerUrl}/client/auth?client_id=${config.clientId}`;
    window.location.href = authUrl;
  }

  /**
   * Обработка токена из query параметров
   * Сохраняет токен в localStorage и очищает URL
   */
  function handleTokenFromQuery(setToken) {
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
    const returnUrl = getItem('return_url', sessionStorage) || '/';
    removeItem('return_url', sessionStorage);
    
    // Убираем token из URL
    const cleanUrl = returnUrl.split('?')[0];
    window.history.replaceState({}, document.title, cleanUrl);
    
    console.log('URL cleaned, ready for API calls');
    return { success: true, token };
  }

  return {
    redirectToAuth,
    handleTokenFromQuery,
  };
}
