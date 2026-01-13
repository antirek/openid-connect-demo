import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createJWTMiddleware } from './middleware/jwt.js';

const PORT = process.env.PORT || 3002;
const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:3000';
const CLIENT_ID = process.env.CLIENT_ID || 'admin-ui';

// Создаем JWT middleware с конфигурацией
const { validateJWT, requireRole } = createJWTMiddleware({
  providerUrl: PROVIDER_URL,
  clientId: CLIENT_ID,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware для парсинга body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Публичный endpoint (без валидации)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  console.log(`  GET  /api/user        - Get user info (requires JWT)`);
  console.log(`  GET  /api/admin       - Admin only (requires JWT + admin role)`);
  console.log(`  GET  /api/data        - Protected data (requires JWT + admin/user role)`);
  console.log(`  POST /api/data        - Create data (requires JWT + admin/user role)`);
  console.log(`\nUsage:`);
  console.log(`  curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:${PORT}/api/user`);
});
