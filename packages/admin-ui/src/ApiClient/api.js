import axios from 'axios';
import { setupRequestInterceptor, setupResponseInterceptor } from './interceptors';

// Используем относительный путь /api для запросов к API
// В dev режиме Vite proxy перенаправит на backend
// В production все запросы идут на тот же сервер
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Настраиваем interceptors
setupRequestInterceptor(apiClient);
setupResponseInterceptor(apiClient);

export const api = {
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};
