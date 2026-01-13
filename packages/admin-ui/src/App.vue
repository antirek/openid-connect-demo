<template>
  <div id="app">
    <header class="header">
      <h1>Admin UI - OIDC Demo</h1>
      <div class="user-info" v-if="user">
        <span>
          <strong>{{ user.name || user.sub }}</strong>
          <span class="badge" :class="`badge-${user.role}`" style="margin-left: 10px;">
            {{ user.role || 'N/A' }}
          </span>
        </span>
        <button class="btn btn-danger" @click="logout">Logout</button>
      </div>
      <div v-else>
        <button class="btn btn-primary" @click="login">Login</button>
      </div>
    </header>

    <div class="container">
      <div v-if="!isAuthenticated" class="card">
        <h2>Authentication Required</h2>
        <p>Please login to access the admin panel.</p>
        <button class="btn btn-primary" @click="login">Login</button>
      </div>

      <div v-else>
        <div v-if="error" class="error">
          {{ error }}
        </div>

        <div v-if="success" class="success">
          {{ success }}
        </div>

        <!-- User Info Card -->
        <div class="card">
          <h2>User Information</h2>
          <div v-if="loading" class="loading">Loading...</div>
          <div v-else-if="userData" class="data-display">
            <pre>{{ JSON.stringify(userData, null, 2) }}</pre>
          </div>
          <button class="btn btn-primary" @click="fetchUserInfo" :disabled="loading">
            Refresh User Info
          </button>
        </div>

        <!-- Admin Only Card -->
        <div class="card" v-if="user?.role === 'admin'">
          <h2>Admin Endpoint</h2>
          <div v-if="adminLoading" class="loading">Loading...</div>
          <div v-else-if="adminData" class="data-display">
            <pre>{{ JSON.stringify(adminData, null, 2) }}</pre>
          </div>
          <button class="btn btn-success" @click="fetchAdminData" :disabled="adminLoading">
            Fetch Admin Data
          </button>
        </div>

        <!-- Protected Data Card -->
        <div class="card">
          <h2>Protected Data</h2>
          <div v-if="dataLoading" class="loading">Loading...</div>
          <div v-else-if="protectedData" class="data-display">
            <pre>{{ JSON.stringify(protectedData, null, 2) }}</pre>
          </div>
          <button class="btn btn-primary" @click="fetchProtectedData" :disabled="dataLoading">
            Refresh Data
          </button>
        </div>

        <!-- Create Data Card -->
        <div class="card">
          <h2>Create Data</h2>
          <form @submit.prevent="createData">
            <div class="form-group">
              <label>Title:</label>
              <input v-model="newData.title" type="text" required />
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea v-model="newData.description" required></textarea>
            </div>
            <button type="submit" class="btn btn-success" :disabled="creating">
              {{ creating ? 'Creating...' : 'Create Data' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from './api';
import { handleCallback } from './callback';
import { handleTokenFromQuery, redirectToAuth } from './auth';

const user = ref(null);
const error = ref(null);
const success = ref(null);
const loading = ref(false);
const adminLoading = ref(false);
const dataLoading = ref(false);
const creating = ref(false);

const userData = ref(null);
const adminData = ref(null);
const protectedData = ref(null);

const newData = ref({
  title: '',
  description: '',
});

const isAuthenticated = computed(() => !!user.value);

// Check authentication on mount
onMounted(async () => {
  // Сначала проверяем, есть ли токен в query параметрах (после авторизации)
  const urlParams = new URLSearchParams(window.location.search);
  const tokenInQuery = urlParams.get('token');
  
  if (tokenInQuery) {
    console.log('App: Token found in query, processing...');
    // Токен в query - сохраняем и очищаем URL
    const tokenResult = handleTokenFromQuery();
    if (tokenResult.success) {
      console.log('App: Token saved, waiting before auth check...');
      // Увеличиваем задержку для гарантии сохранения токена и очистки URL
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Проверяем, что токен действительно сохранен
      const savedToken = localStorage.getItem('jwt_token');
      if (!savedToken) {
        console.error('App: Token was not saved!');
        return;
      }
      
      console.log('App: Token confirmed saved, checking auth...');
      // Проверяем авторизацию
      try {
        await checkAuth();
        if (isAuthenticated.value) {
          console.log('App: Auth successful, fetching data...');
          fetchUserInfo();
          fetchProtectedData();
        } else {
          console.log('App: Auth check completed but user not authenticated');
        }
      } catch (err) {
        console.error('App: Auth check failed after token from query:', {
          error: err.message,
          response: err.response?.data,
          status: err.response?.status,
        });
        // Если проверка не удалась, не редиректим снова - токен уже сохранен
        // Interceptor обработает 401 при следующем запросе, если токен невалидный
      }
    } else {
      console.error('App: Failed to save token from query:', tokenResult.error);
    }
    return;
  }
  
  // Если нет токена в query, проверяем callback (session параметр)
  const sessionInQuery = urlParams.get('session');
  if (sessionInQuery) {
    const callbackResult = await handleCallback();
    if (callbackResult?.success) {
      // Небольшая задержка для гарантии сохранения токена
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Token stored, now check auth
      try {
        await checkAuth();
        if (isAuthenticated.value) {
          fetchUserInfo();
          fetchProtectedData();
        }
      } catch (err) {
        console.error('Auth check failed after callback:', err);
      }
    }
    return;
  }
  
  // Если нет callback параметров, проверяем существующий токен
  const existingToken = localStorage.getItem('jwt_token');
  if (existingToken) {
    try {
      await checkAuth();
      if (isAuthenticated.value) {
        fetchUserInfo();
        fetchProtectedData();
      }
    } catch (err) {
      console.error('Auth check failed with existing token:', err);
      // Токен невалидный - будет редирект через interceptor при следующем запросе
    }
  }
});

// Check if user is authenticated
async function checkAuth() {
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    console.log('checkAuth: No token in localStorage');
    user.value = null;
    return;
  }
  
  console.log('checkAuth: Token found, making API request', {
    tokenLength: token.length,
    tokenStart: token.substring(0, 20) + '...',
  });
  
  try {
    const data = await api.get('/user');
    console.log('checkAuth: Success, user authenticated', data.user);
    user.value = data.user;
  } catch (err) {
    console.error('Auth check failed:', {
      status: err.response?.status,
      statusText: err.response?.statusText,
      error: err.response?.data,
      message: err.message,
    });
    // Не удаляем токен здесь - пусть interceptor обработает 401
    // Если это не 401, то токен может быть валидным, просто ошибка запроса
    if (err.response?.status === 401) {
      console.log('checkAuth: 401 received, removing token');
      localStorage.removeItem('jwt_token');
      user.value = null;
    }
    throw err; // Пробрасываем ошибку дальше
  }
}

// Login - redirect to provider
function login() {
  redirectToAuth();
}

// Logout
function logout() {
  localStorage.removeItem('jwt_token');
  user.value = null;
  userData.value = null;
  adminData.value = null;
  protectedData.value = null;
  error.value = null;
  success.value = 'Logged out successfully';
  setTimeout(() => {
    success.value = null;
  }, 3000);
}

// Fetch user info
async function fetchUserInfo() {
  loading.value = true;
  error.value = null;
  try {
    userData.value = await api.get('/user');
    user.value = userData.value.user;
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Failed to fetch user info';
    if (err.response?.status === 401) {
      logout();
    }
  } finally {
    loading.value = false;
  }
}

// Fetch admin data
async function fetchAdminData() {
  adminLoading.value = true;
  error.value = null;
  try {
    adminData.value = await api.get('/admin');
    success.value = 'Admin data fetched successfully';
    setTimeout(() => {
      success.value = null;
    }, 3000);
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Failed to fetch admin data';
    if (err.response?.status === 401) {
      logout();
    }
  } finally {
    adminLoading.value = false;
  }
}

// Fetch protected data
async function fetchProtectedData() {
  dataLoading.value = true;
  error.value = null;
  try {
    protectedData.value = await api.get('/data');
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Failed to fetch protected data';
    if (err.response?.status === 401) {
      logout();
    }
  } finally {
    dataLoading.value = false;
  }
}

// Create data
async function createData() {
  creating.value = true;
  error.value = null;
  success.value = null;
  
  try {
    const response = await api.post('/data', newData.value);
    success.value = 'Data created successfully';
    newData.value = { title: '', description: '' };
    fetchProtectedData(); // Refresh data list
    setTimeout(() => {
      success.value = null;
    }, 3000);
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Failed to create data';
    if (err.response?.status === 401) {
      logout();
    }
  } finally {
    creating.value = false;
  }
}

</script>
