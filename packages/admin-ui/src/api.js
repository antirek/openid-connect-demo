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
let last401Time = 0;
const REDIRECT_COOLDOWN = 2000; // 2 секунды между редиректами

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const now = Date.now();
      
      // Проверяем, не происходит ли уже редирект
      if (isRedirecting) {
        console.log('API: Already redirecting, ignoring 401');
        return Promise.reject(error);
      }
      
      // Проверяем cooldown между редиректами
      if (now - last401Time < REDIRECT_COOLDOWN) {
        console.log('API: 401 cooldown active, ignoring');
        return Promise.reject(error);
      }
      
      // Проверяем, не находимся ли мы уже на странице с токеном в query
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('token')) {
        console.log('API: Token in query, not redirecting - let handleTokenFromQuery process it');
        return Promise.reject(error);
      }
      
      // Проверяем, есть ли токен в localStorage
      const token = localStorage.getItem('jwt_token');
      if (!token) {
        console.log('API: No token in localStorage, redirecting to auth');
      } else {
        console.log('API: Token exists but validation failed, redirecting to auth', {
          tokenLength: token.length,
          errorDetails: error.response?.data,
        });
      }
      
      // Unauthorized - clear token and redirect to auth
      localStorage.removeItem('jwt_token');
      
      // Устанавливаем флаг редиректа и время
      isRedirecting = true;
      last401Time = now;
      
      // Сбрасываем флаг через cooldown
      setTimeout(() => {
        isRedirecting = false;
      }, REDIRECT_COOLDOWN);
      
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
