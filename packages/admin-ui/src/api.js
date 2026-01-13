import axios from 'axios';
import { redirectToAuth } from './auth';

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

// Request interceptor to add JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Логирование для отладки (можно убрать в production)
      if (import.meta.env.DEV) {
        console.log('API Request:', config.method?.toUpperCase(), config.url, 'with token:', token.substring(0, 20) + '...');
      }
    } else {
      if (import.meta.env.DEV) {
        console.log('API Request:', config.method?.toUpperCase(), config.url, 'without token');
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Флаг для предотвращения множественных редиректов
let isRedirecting = false;

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Проверяем, не происходит ли уже редирект
      if (isRedirecting) {
        return Promise.reject(error);
      }
      
      // Проверяем, не находимся ли мы уже на странице с токеном в query
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('token')) {
        // Если есть токен в query, не редиректим - пусть handleTokenFromQuery обработает
        return Promise.reject(error);
      }
      
      // Unauthorized - clear token and redirect to auth
      localStorage.removeItem('jwt_token');
      
      // Устанавливаем флаг редиректа
      isRedirecting = true;
      
      // Редиректим на auth с client_id
      redirectToAuth();
      
      // Возвращаем промис, который никогда не резолвится (так как происходит редирект)
      return new Promise(() => {});
    }
    return Promise.reject(error);
  }
);

export const api = {
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
};
