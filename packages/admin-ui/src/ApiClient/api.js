// Используем apiClient из apiClient.js
// Interceptors уже настроены плагином автоматически
import { apiClient } from '../apiClient.js';

export const api = {
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};
