// Главный экспорт пакета

export { createAuthPlugin } from './plugin.js';
export { useAuth } from './composables/useAuth.js';

// Экспорт утилит для продвинутого использования
export { createTokenManager } from './auth/token.js';
export { createConfigManager } from './auth/config.js';
export { createRedirectManager } from './auth/redirect.js';
