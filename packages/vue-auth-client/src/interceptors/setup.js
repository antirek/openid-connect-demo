// Настройка Axios interceptors

export function setupRequestInterceptor(apiClient, getToken) {
  apiClient.interceptors.request.use(
    (config) => {
      const token = getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        // Логирование для отладки (можно убрать в production)
        if (import.meta.env?.DEV) {
          console.log('API Request:', config.method?.toUpperCase(), config.url, 'with token:', token.substring(0, 20) + '...');
        }
      } else {
        if (import.meta.env?.DEV) {
          console.log('API Request:', config.method?.toUpperCase(), config.url, 'without token');
        }
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
}

export function setupResponseInterceptor(apiClient, redirectToAuth, removeToken, redirectCooldown = 2000, getToken) {
  // Флаг для предотвращения множественных редиректов
  let isRedirecting = false;
  let last401Time = 0;

  /**
   * Обработка 401 ошибки (Unauthorized)
   */
  function handle401Error(error) {
    const now = Date.now();
    
    // Проверяем, не происходит ли уже редирект
    if (isRedirecting) {
      console.log('API: Already redirecting, ignoring 401');
      return Promise.reject(error);
    }
    
    // Проверяем cooldown между редиректами
    if (now - last401Time < redirectCooldown) {
      console.log('API: 401 cooldown active, ignoring');
      return Promise.reject(error);
    }
    
    // Проверяем, не находимся ли мы уже на странице с токеном в query
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
      console.log('API: Token in query, not redirecting - let handleTokenFromQuery process it');
      return Promise.reject(error);
    }
    
    // Проверяем, есть ли токен
    const token = getToken ? getToken() : null;
    if (!token) {
      console.log('API: No token, redirecting to auth');
    } else {
      console.log('API: Token exists but validation failed, redirecting to auth', {
        tokenLength: token.length,
        errorDetails: error.response?.data,
      });
    }
    
    // Unauthorized - clear token and redirect to auth
    removeToken();
    
    // Устанавливаем флаг редиректа и время
    isRedirecting = true;
    last401Time = now;
    
    // Сбрасываем флаг через cooldown
    setTimeout(() => {
      isRedirecting = false;
    }, redirectCooldown);
    
    // Редиректим на auth с client_id
    redirectToAuth();
    
    // Возвращаем промис, который никогда не резолвится (так как происходит редирект)
    return new Promise(() => {});
  }

  apiClient.interceptors.response.use(
    (response) => response.data,
    (error) => {
      if (error.response?.status === 401) {
        return handle401Error(error);
      }
      return Promise.reject(error);
    }
  );
}
