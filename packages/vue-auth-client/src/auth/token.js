// Управление токенами

import { getItem, setItem, removeItem } from '../utils/storage.js';

export function createTokenManager(tokenKey = 'jwt_token') {
  /**
   * Получение токена из хранилища
   */
  function getToken() {
    return getItem(tokenKey) || null;
  }

  /**
   * Сохранение токена в хранилище
   */
  function setToken(token) {
    if (!token) {
      console.warn('setToken: Attempting to set empty token');
      return false;
    }
    
    const saved = setItem(tokenKey, token);
    if (!saved) {
      return false;
    }
    
    // Проверяем, что токен действительно сохранен
    const savedToken = getToken();
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
  function removeToken() {
    removeItem(tokenKey);
  }

  /**
   * Проверка наличия токена
   */
  function hasToken() {
    return !!getToken();
  }

  return {
    getToken,
    setToken,
    removeToken,
    hasToken,
  };
}
