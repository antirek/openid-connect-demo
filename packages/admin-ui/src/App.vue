<template>
  <div id="app">
    <header class="header">
      <h1>Admin UI - OIDC Demo</h1>
      <div class="user-info" v-if="currentUser">
        <span>
          <strong>{{ currentUser.name || currentUser.sub }}</strong>
          <span class="badge" :class="`badge-${currentUser.role}`" style="margin-left: 10px;">
            {{ currentUser.role || 'N/A' }}
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
        <div class="card" v-if="currentUser?.role === 'admin'">
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
import { ref, onMounted } from 'vue';
import { useAuth } from '@demo/vue-auth-client';
import { apiClient } from './apiClient.js';

// Используем auth из плагина
const {
  currentUser,
  isAuthenticated,
  login,
  logout: authLogout,
  initialize,
} = useAuth();

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

// Инициализация приложения
onMounted(async () => {
  const { authenticated } = await initialize();
  
  if (authenticated) {
    // Загружаем защищенные данные
    fetchProtectedData();
  }
});

// Logout
function logout() {
  authLogout();
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
    userData.value = await apiClient.get('/user');
    // currentUser обновляется автоматически через verifyAuth
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
    adminData.value = await apiClient.get('/admin');
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
    protectedData.value = await apiClient.get('/data');
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
    const response = await apiClient.post('/data', newData.value);
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
