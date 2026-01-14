# @demo/jwt-middleware

JWT validation middleware для Express.js с поддержкой OIDC (OpenID Connect).

## Описание

Этот пакет предоставляет middleware для валидации JWT токенов, выданных OIDC Provider. Middleware выполняет:

- ✅ Валидацию подписи токена через JWKS (JSON Web Key Set)
- ✅ Проверку issuer, audience, expiration
- ✅ Защиту от replay-атак через nonce валидацию
- ✅ Извлечение данных пользователя из токена (sub, name, email, role)
- ✅ Middleware для проверки ролей пользователя

## Установка

```bash
npm install @demo/jwt-middleware
```

## Использование

### Базовое использование

```javascript
import express from 'express';
import { createJWTMiddleware } from '@demo/jwt-middleware';

const app = express();

// Создаем middleware с конфигурацией
const { validateJWT, requireRole } = createJWTMiddleware({
  providerUrl: 'http://localhost:3000',  // URL OIDC Provider
  clientId: 'my-app',                    // Client ID вашего приложения
});

// Защищенный endpoint (требует JWT)
app.get('/api/user', validateJWT, (req, res) => {
  // req.user содержит данные пользователя из токена
  res.json({
    user: req.user,  // { sub, name, email, role }
    token: req.token // Полный JWT токен
  });
});

// Endpoint только для admin
app.get('/api/admin', validateJWT, requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin only' });
});

// Endpoint для нескольких ролей
app.get('/api/data', validateJWT, requireRole('admin', 'user'), (req, res) => {
  res.json({ message: 'Protected data' });
});
```

### Конфигурация

```javascript
const { validateJWT, requireRole } = createJWTMiddleware({
  providerUrl: process.env.PROVIDER_URL || 'http://localhost:3000',
  clientId: process.env.CLIENT_ID || 'my-app',
});
```

**Параметры:**
- `providerUrl` (обязательный) - URL OIDC Provider (например, `http://localhost:3000`)
- `clientId` (обязательный) - Client ID вашего приложения

## API

### `createJWTMiddleware(config)`

Создает JWT middleware с указанной конфигурацией.

**Параметры:**
- `config.providerUrl` - URL OIDC Provider
- `config.clientId` - Client ID приложения

**Возвращает:**
- `validateJWT` - Express middleware для валидации JWT
- `requireRole` - Функция для создания middleware проверки ролей

### `validateJWT`

Express middleware для валидации JWT токена.

**Требования:**
- Токен должен быть в заголовке `Authorization: Bearer <token>`
- Токен должен быть валидным JWT, выданным указанным OIDC Provider
- Токен должен содержать `nonce` (для защиты от replay-атак)

**Устанавливает:**
- `req.user` - объект с данными пользователя:
  - `sub` - subject (ID пользователя)
  - `name` - имя пользователя
  - `email` - email пользователя
  - `role` - роль пользователя для этого приложения
- `req.token` - полный JWT токен

**Ошибки:**
- `401 Unauthorized` - если токен отсутствует, невалидный или истек
- `401 invalid_issuer` - если issuer не совпадает
- `401 invalid_audience` - если audience не совпадает
- `401 invalid_nonce` - если nonce отсутствует или невалидный

### `requireRole(...allowedRoles)`

Создает Express middleware для проверки ролей пользователя.

**Параметры:**
- `...allowedRoles` - список разрешенных ролей

**Использование:**
```javascript
// Только для admin
app.get('/api/admin', validateJWT, requireRole('admin'), handler);

// Для admin или user
app.get('/api/data', validateJWT, requireRole('admin', 'user'), handler);
```

**Ошибки:**
- `401 Unauthorized` - если пользователь не аутентифицирован
- `403 Forbidden` - если роль пользователя не входит в список разрешенных

## Валидация токена

Middleware выполняет следующие проверки:

1. **Формат JWT** - проверка структуры токена (header.payload.signature)
2. **Expiration** - проверка срока действия токена
3. **Issuer** - проверка, что токен выдан правильным Provider
4. **Audience** - проверка, что токен предназначен для этого приложения
5. **Signature** - криптографическая проверка подписи через JWKS
6. **Nonce** - проверка nonce для защиты от replay-атак

## Защита от replay-атак

Middleware отслеживает использованные токены по ключу `nonce:sub:iat`:
- Один токен может использоваться многократно в течение срока действия
- Разные токены с одинаковым nonce не могут быть использованы повторно
- Использованные токены автоматически удаляются через TTL (1 час)

## Зависимости

- `openid-client` - для discovery OIDC Provider
- `jose` - для валидации JWT и работы с JWKS

## Peer Dependencies

- `express` - Express.js framework

## Примеры

### Полный пример

```javascript
import express from 'express';
import { createJWTMiddleware } from '@demo/jwt-middleware';

const app = express();
app.use(express.json());

const { validateJWT, requireRole } = createJWTMiddleware({
  providerUrl: process.env.PROVIDER_URL || 'http://localhost:3000',
  clientId: process.env.CLIENT_ID || 'my-app',
});

// Публичный endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Защищенный endpoint
app.get('/api/user', validateJWT, (req, res) => {
  res.json({
    message: 'User information',
    user: req.user,
  });
});

// Endpoint только для admin
app.get('/api/admin', validateJWT, requireRole('admin'), (req, res) => {
  res.json({
    message: 'Admin endpoint',
    user: req.user,
  });
});

// Endpoint для admin и user
app.get('/api/data', validateJWT, requireRole('admin', 'user'), (req, res) => {
  res.json({
    message: 'Protected data',
    user: req.user,
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Лицензия

MIT
