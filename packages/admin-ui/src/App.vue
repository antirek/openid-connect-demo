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
  // Handle OIDC callback if present
  const callbackResult = await handleCallback();
  if (callbackResult?.success) {
    // Token stored, now check auth
    await checkAuth();
  } else if (callbackResult?.error) {
    error.value = callbackResult.error;
  }
  
  await checkAuth();
  if (isAuthenticated.value) {
    fetchUserInfo();
    fetchProtectedData();
  }
});

// Check if user is authenticated
async function checkAuth() {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    try {
      const data = await api.get('/api/user');
      user.value = data.user;
    } catch (err) {
      console.error('Auth check failed:', err);
      localStorage.removeItem('jwt_token');
      user.value = null;
    }
  }
}

// Login - redirect to provider
function login() {
  const providerUrl = 'http://localhost:3000';
  const clientId = 'admin-ui';
  const redirectUri = encodeURIComponent('http://localhost:3001/callback');
  const scope = 'openid profile email';
  
  const authUrl = `${providerUrl}/auth?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`;
  
  // Store current URL to return after login
  sessionStorage.setItem('return_url', window.location.href);
  
  window.location.href = authUrl;
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
    userData.value = await api.get('/api/user');
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
    adminData.value = await api.get('/api/admin');
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
    protectedData.value = await api.get('/api/data');
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
    const response = await api.post('/api/data', newData.value);
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
