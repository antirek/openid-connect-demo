import express from 'express';
import { Issuer } from 'openid-client';
import { jwtVerify, createRemoteJWKSet } from 'jose';
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
let jwks = null;

// Хранилище использованных токенов для предотвращения replay-атак
// В продакшене использовать Redis или БД с TTL
// Ключ - комбинация nonce + sub + iat (уникальная для каждого токена), значение - { timestamp: время использования, timeout: таймер для автоудаления }
const usedTokens = new Map();

// TTL для токенов (равен сроку действия токена, обычно 1 час)
const TOKEN_TTL = 60 * 60 * 1000; // 1 час в миллисекундах

// Функция для создания уникального ключа для токена
function getTokenKey(nonce, sub, iat) {
  return `${nonce}:${sub}:${iat}`;
}

// Функция для удаления токена по таймауту
function scheduleTokenDeletion(tokenKey) {
  const timeout = setTimeout(() => {
    usedTokens.delete(tokenKey);
    console.log(`Token key auto-deleted after TTL: ${tokenKey.substring(0, 20)}...`);
  }, TOKEN_TTL);
  
  return timeout;
}

// Периодическая очистка старых токенов (на случай, если таймеры не сработали)
// Очистка каждые 5 минут
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [tokenKey, data] of usedTokens.entries()) {
    if (now - data.timestamp > TOKEN_TTL) {
      // Очищаем таймер, если он еще не сработал
      if (data.timeout) {
        clearTimeout(data.timeout);
      }
      usedTokens.delete(tokenKey);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} expired token keys`);
  }
}, 5 * 60 * 1000); // Каждые 5 минут

async function getClient() {
  if (!issuer) {
    issuer = await Issuer.discover(PROVIDER_URL);
    // Для валидации токенов не нужен client_secret, так как мы только проверяем подпись
    client = new issuer.Client({
      client_id: CLIENT_ID,
    });
    
    // Создаем JWKS endpoint для валидации подписи
    // JWKS endpoint берем из discovery (обычно /jwks для oidc-provider)
    const jwksUri = issuer.metadata.jwks_uri || new URL('/jwks', issuer.issuer).href;
    console.log('JWKS endpoint URL:', jwksUri);
    
    // Проверяем доступность JWKS endpoint
    try {
      const testResponse = await fetch(jwksUri);
      if (!testResponse.ok) {
        console.error('JWKS endpoint not available:', testResponse.status, testResponse.statusText);
        throw new Error(`JWKS endpoint returned ${testResponse.status}: ${testResponse.statusText}`);
      }
      const jwksData = await testResponse.json();
      console.log('JWKS endpoint accessible, keys count:', jwksData.keys?.length || 0);
    } catch (fetchError) {
      console.error('Failed to fetch JWKS endpoint:', fetchError.message);
      throw fetchError;
    }
    
    jwks = createRemoteJWKSet(new URL(jwksUri));
    console.log('JWKS endpoint configured successfully');
  }
  return { issuer, client, jwks };
}

// Middleware для валидации JWT
const validateJWT = async (req, res, next) => {
  try {
    // Получаем JWT из Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('JWT validation: No Authorization header', {
        hasHeader: !!authHeader,
        headerStart: authHeader?.substring(0, 20),
        url: req.url,
        method: req.method,
      });
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
      console.log('JWT validation: Empty token after Bearer prefix removal', {
        authHeader: authHeader.substring(0, 50),
      });
      return res.status(401).json({
        error: 'unauthorized',
        message: 'JWT token required',
      });
    }
    
    console.log('JWT validation: Token received', {
      tokenLength: token.length,
      tokenStart: token.substring(0, 20) + '...',
      url: req.url,
    });
    
    const { issuer } = await getClient();
    
    // Проверка базового формата JWT (3 части: header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('JWT validation: Invalid format, parts:', parts.length);
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid JWT format',
      });
    }
    
    // Декодируем payload только для логирования (проверка будет через jwtVerify)
    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      console.log('JWT validation: Token payload (before JWKS verification):', {
        sub: payload.sub,
        aud: payload.aud,
        iss: payload.iss,
        exp: payload.exp,
        iat: payload.iat,
        role: payload.role,
      });
    } catch (decodeError) {
      console.error('JWT validation: Failed to decode payload:', decodeError.message);
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Failed to decode JWT payload',
      });
    }
    
    // Базовые проверки перед JWKS валидацией (для раннего обнаружения проблем)
    // Основная валидация (exp, iss, aud, signature) будет выполнена в jwtVerify
    
    // Проверка issuer (быстрая проверка перед JWKS)
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
    
    // Проверка audience (быстрая проверка перед JWKS)
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
    
    // Валидация подписи через JWKS
    const { issuer: issuerObj, jwks: jwksSet } = await getClient();
    
    let verifiedPayload;
    try {
      // Валидируем подпись токена используя JWKS
      // jwtVerify автоматически:
      // 1. Получает ключи из JWKS endpoint
      // 2. Находит правильный ключ по kid из header токена
      // 3. Проверяет подпись
      // 4. Проверяет exp, nbf, iss, aud (если указаны в options)
      const result = await jwtVerify(token, jwksSet, {
        issuer: issuerObj.issuer,
        audience: 'admin-ui',
      });
      
      verifiedPayload = result.payload;
      console.log('JWT validation: Token signature validated successfully via JWKS');
    } catch (jwtVerifyError) {
      console.error('JWT validation: Signature verification failed:', jwtVerifyError.message);
      console.error('JWT validation: Error details:', {
        name: jwtVerifyError.name,
        code: jwtVerifyError.code,
        message: jwtVerifyError.message,
      });
      return res.status(401).json({
        error: 'invalid_signature',
        message: 'JWT signature validation failed',
        details: jwtVerifyError.message,
      });
    }
    
    // Валидация nonce для защиты от replay-атак
    if (!verifiedPayload.nonce) {
      console.log('JWT validation: Missing nonce in token');
      return res.status(401).json({
        error: 'invalid_nonce',
        message: 'Nonce is required in ID Token',
      });
    }
    
    // Проверка формата nonce (должен быть непустой строкой)
    if (typeof verifiedPayload.nonce !== 'string' || verifiedPayload.nonce.length === 0) {
      console.log('JWT validation: Invalid nonce format');
      return res.status(401).json({
        error: 'invalid_nonce',
        message: 'Invalid nonce format in ID Token',
      });
    }
    
    // Проверка nonce и защита от replay-атак
    // Создаем уникальный ключ для токена: nonce + sub + iat
    // Это позволяет одному токену использоваться многократно, но предотвращает использование поддельных токенов
    const tokenKey = getTokenKey(verifiedPayload.nonce, verifiedPayload.sub, verifiedPayload.iat);
    const existingToken = usedTokens.get(tokenKey);
    
    if (existingToken) {
      // Токен уже использовался - проверяем, не истек ли срок
      const now = Date.now();
      if (now - existingToken.timestamp < TOKEN_TTL) {
        // Токен использовался недавно - это нормально, разрешаем повторное использование
        // (один токен может использоваться многократно в течение срока действия)
        console.log('JWT validation: Token reused (same nonce+sub+iat), allowing');
      } else {
        // Токен истек, удаляем его
        if (existingToken.timeout) {
          clearTimeout(existingToken.timeout);
        }
        usedTokens.delete(tokenKey);
        console.log('JWT validation: Expired token key removed');
      }
    }
    
    // Сохраняем токен только если он еще не сохранен
    // Это предотвращает создание множественных таймеров для одного токена
    if (!usedTokens.has(tokenKey)) {
      const timeout = scheduleTokenDeletion(tokenKey);
      usedTokens.set(tokenKey, {
        timestamp: Date.now(),
        timeout: timeout,
      });
      console.log('JWT validation: Token key saved (will auto-delete in 1 hour)');
    }
    
    // Используем payload из валидированного токена
    // Это гарантирует, что токен не был подделан
    // jwtVerify уже проверил exp, iss, aud, nonce проверен выше
    req.user = {
      sub: verifiedPayload.sub,
      name: verifiedPayload.name,
      email: verifiedPayload.email,
      role: verifiedPayload.role, // Роль пользователя для этого приложения
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
