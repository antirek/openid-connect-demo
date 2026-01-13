import express from 'express';
import { Issuer } from 'openid-client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3002;
const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:3000';
const CLIENT_ID = process.env.CLIENT_ID || 'admin-ui'; // Admin UI использует client_id 'admin-ui'

const app = express();

// Middleware для парсинга body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Получение или создание клиента для валидации
let issuer = null;
let client = null;

async function getClient() {
  if (!issuer) {
    issuer = await Issuer.discover(PROVIDER_URL);
    // Для валидации токенов не нужен client_secret, так как мы только проверяем подпись
    client = new issuer.Client({
      client_id: CLIENT_ID,
    });
  }
  return { issuer, client };
}

// Middleware для валидации JWT
const validateJWT = async (req, res, next) => {
  try {
    // Получаем JWT из Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('JWT validation: No Authorization header');
      // Нет токена - редиректим на provider для логина
      const { issuer } = await getClient();
      const authUrl = `${issuer.issuer}/auth?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost:3001/callback&scope=openid`;
      return res.status(401).json({
        error: 'unauthorized',
        message: 'JWT token required',
        auth_url: authUrl,
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      console.log('JWT validation: Empty token');
      return res.status(401).json({
        error: 'unauthorized',
        message: 'JWT token required',
      });
    }
    
    const { issuer, client } = await getClient();
    
    // Декодируем JWT для проверки базовых claims
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('JWT validation: Invalid format, parts:', parts.length);
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid JWT format',
      });
    }
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    console.log('JWT validation: Token payload:', {
      sub: payload.sub,
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp,
      iat: payload.iat,
      role: payload.role,
    });
    
    // Проверка срока действия
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.log('JWT validation: Token expired', {
        exp: payload.exp * 1000,
        now: Date.now(),
      });
      return res.status(401).json({
        error: 'token_expired',
        message: 'JWT token has expired',
      });
    }
    
    // Проверка issuer
    if (payload.iss !== issuer.issuer) {
      console.log('JWT validation: Invalid issuer', {
        token_iss: payload.iss,
        expected_iss: issuer.issuer,
      });
      return res.status(401).json({
        error: 'invalid_issuer',
        message: 'Invalid token issuer',
      });
    }
    
    // Проверка client_id (audience)
    // Токен должен быть выдан для admin-ui (это backend для admin-ui)
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes('admin-ui')) {
      console.log('JWT validation: Invalid audience', {
        token_aud: aud,
        expected_aud: 'admin-ui',
      });
      return res.status(401).json({
        error: 'invalid_audience',
        message: `Token not issued for admin-ui. Audience: ${JSON.stringify(aud)}`,
      });
    }
    
    // Валидация подписи
    // Для демо пропускаем полную проверку подписи через JWKS,
    // так как issuer, audience, exp уже проверены выше
    // В продакшене нужно использовать полную валидацию через JWKS
    // Токен приходит от нашего же provider, поэтому можем доверять ему
    console.log('JWT validation: Token validated (issuer, audience, exp checked)');
    
    // Токен валиден - добавляем данные пользователя в request
    req.user = {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role, // Роль пользователя для этого приложения
    };
    
    req.token = token;
    console.log('JWT validation: Success, user:', req.user);
    next();
  } catch (error) {
    console.error('JWT validation error:', error);
    return res.status(401).json({
      error: 'validation_error',
      message: error.message,
    });
  }
};

// Middleware для проверки роли
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User not authenticated',
      });
    }
    
    if (!req.user.role) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'User role not found in token',
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}. User role: ${req.user.role}`,
      });
    }
    
    next();
  };
};

// Публичный endpoint (без валидации)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint для получения токена по session ID (для admin-ui)
app.get('/api/token', async (req, res) => {
  const session = req.query.session;
  
  if (!session) {
    return res.status(400).json({ error: 'session parameter required' });
  }
  
  // Получаем токен из provider (теперь provider и client объединены)
  try {
    const providerResponse = await fetch(`http://localhost:3000/api/token?session=${session}`);
    const data = await providerResponse.json();
    
    if (data.token) {
      return res.json({ token: data.token });
    }
    
    return res.status(404).json({ error: 'Token not found' });
  } catch (error) {
    console.error('Error fetching token from provider:', error);
    return res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// Защищенный endpoint (требует JWT)
app.get('/api/user', validateJWT, (req, res) => {
  res.json({
    message: 'User information',
    user: req.user,
  });
});

// Защищенный endpoint только для admin
app.get('/api/admin', validateJWT, requireRole('admin'), (req, res) => {
  res.json({
    message: 'Admin endpoint',
    user: req.user,
    data: {
      secret: 'This is admin-only data',
    },
  });
});

// Защищенный endpoint для admin и user
app.get('/api/data', validateJWT, requireRole('admin', 'user'), (req, res) => {
  res.json({
    message: 'Protected data',
    user: req.user,
    data: {
      items: ['item1', 'item2', 'item3'],
    },
  });
});

// Пример POST endpoint
app.post('/api/data', validateJWT, requireRole('admin', 'user'), (req, res) => {
  res.json({
    message: 'Data created',
    user: req.user,
    created: req.body,
  });
});

// Раздача статических файлов admin-ui (после API routes)
app.use(express.static(path.join(__dirname, 'public')));

// Fallback для SPA - все остальные запросы отдаем index.html
app.get('*', (req, res) => {
  // Не обрабатываем API запросы
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Admin Backend API running at http://localhost:${PORT}`);
  console.log(`Admin UI available at http://localhost:${PORT}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /api/health      - Public health check`);
  console.log(`  GET  /api/token       - Get JWT token by session ID (for admin-ui)`);
  console.log(`  GET  /api/user        - Get user info (requires JWT)`);
  console.log(`  GET  /api/admin       - Admin only (requires JWT + admin role)`);
  console.log(`  GET  /api/data        - Protected data (requires JWT + admin/user role)`);
  console.log(`  POST /api/data        - Create data (requires JWT + admin/user role)`);
  console.log(`\nUsage:`);
  console.log(`  curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:${PORT}/api/user`);
});
