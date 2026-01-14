// Vue 3 Composable для авторизации

import { ref, computed } from 'vue';

export function useAuth() {
  // Получаем экземпляр auth из глобального состояния
  // Это будет установлено плагином
  const authInstance = getAuthInstance();
  
  if (!authInstance) {
    throw new Error('useAuth() must be used after app.use(createAuthPlugin(...))');
  }

  return {
    // Состояние
    currentUser: authInstance.currentUser,
    token: authInstance.token,
    config: authInstance.config,
    isAuthenticated: computed(() => !!authInstance.currentUser.value),
    
    // Состояния загрузки
    isLoadingConfig: authInstance.isLoadingConfig,
    isVerifyingAuth: authInstance.isVerifyingAuth,
    isLoadingUser: authInstance.isLoadingUser,
    
    // Методы авторизации
    login: authInstance.login,
    redirectToAuth: authInstance.redirectToAuth,
    logout: authInstance.logout,
    
    // Методы проверки и загрузки
    verifyAuth: authInstance.verifyAuth,
    fetchUser: authInstance.fetchUser,
    loadConfig: authInstance.loadConfig,
    
    // Утилиты
    handleTokenFromQuery: authInstance.handleTokenFromQuery,
    clearConfigCache: authInstance.clearConfigCache,
  };
}

// Глобальное хранилище экземпляра auth
let authInstance = null;

export function setAuthInstance(instance) {
  authInstance = instance;
}

export function getAuthInstance() {
  return authInstance;
}
