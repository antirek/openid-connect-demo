import express from 'express';
import { Issuer, generators } from 'openid-client';

const PORT = process.env.PORT || 3001;
const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:3000';

const app = express();

// Middleware для парсинга body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Временное хранилище для PKCE flow (только между началом авторизации и callback)
// Ключ - state, значение - { codeVerifier, nonce, redirectUrl }
// Автоматически очищается после использования
const pkceStorage = new Map();

// Маппинг client_id -> redirect_url (должен совпадать с конфигурацией в provider)
// В продакшене получать из конфигурации или API provider
const clientRedirectUrls = {
  'demo-client': 'http://localhost:3001/',
  'app2': 'http://localhost:3001/',
  'admin-ui': 'http://localhost:3003/',
};

// Простое хранилище токенов по session ID (только для передачи токена после callback)
// Ключ - короткий session ID, значение - tokenSet
// В продакшене использовать Redis или БД с TTL
const tokenStorage = new Map();

// Получение или создание клиента
let issuer = null;
let client = null;

async function getClient() {
  if (!issuer) {
    issuer = await Issuer.discover(PROVIDER_URL);
    client = new issuer.Client({
      client_id: 'demo-client',
      client_secret: 'demo-secret',
      redirect_uris: [`http://localhost:${PORT}/callback`],
      response_types: ['code'],
    });
  }
  return { issuer, client };
}

// Функция для декодирования JWT
function decodeJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  return { header, payload };
}

// Middleware для проверки токена
const requireAuth = async (req, res, next) => {
  try {
    // Получаем session ID из query параметра
    const sessionId = req.query.session;
    
    if (!sessionId) {
      // Нет session ID - редиректим на авторизацию
      return res.redirect('/auth');
    }
    
    // Получаем токен из хранилища
    const tokenSet = tokenStorage.get(sessionId);
    
    if (!tokenSet) {
      // Токен не найден или истек - редиректим на авторизацию
      return res.redirect('/auth');
    }
    
    const { issuer, client } = await getClient();
    
    // Валидируем токен из tokenSet
    // Если есть ID токен, валидируем его
    if (tokenSet.id_token) {
      try {
        // Получаем claims из tokenSet (openid-client уже проверил подпись при callback)
        const claims = tokenSet.claims();
        
        // Проверка срока действия
        if (claims.exp && claims.exp * 1000 < Date.now()) {
          throw new Error('Token expired');
        }
        
        // Проверка issuer
        if (claims.iss !== issuer.issuer) {
          throw new Error('Invalid issuer');
        }
        
        // Проверка client_id (audience)
        const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (!aud.includes('demo-client') && !aud.includes(client.client_id)) {
          throw new Error('Invalid client_id in token');
        }
        
        // Токен валиден - добавляем в request
        req.token = tokenSet.id_token;
        req.tokenSet = tokenSet;
        req.tokenType = 'id_token';
        req.user = claims;
        next();
        return;
      } catch (idTokenError) {
        console.error('ID token validation failed:', idTokenError.message);
        // Пробуем как access token
      }
    }
    
    // Если нет ID токена или валидация не прошла, пробуем access token
    if (tokenSet.access_token) {
      try {
        // Для access token используем userinfo endpoint для валидации
        const userinfo = await client.userinfo(tokenSet.access_token);
        
        req.token = tokenSet.access_token;
        req.tokenSet = tokenSet;
        req.tokenType = 'access_token';
        req.user = userinfo;
        next();
        return;
      } catch (accessTokenError) {
        console.error('Access token validation failed:', accessTokenError.message);
      }
    }
    
    // Оба варианта не прошли - удаляем токен и редиректим на авторизацию
    tokenStorage.delete(sessionId);
    return res.redirect('/auth');
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.redirect('/auth');
  }
};

// Начало процесса авторизации
app.get('/auth', async (req, res) => {
  try {
    const { issuer, client } = await getClient();
    
    // Генерация code_verifier и code_challenge для PKCE
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    
    // Генерация state и nonce
    const state = generators.random();
    const nonce = generators.random();
    
    // Получаем redirect_url для этого клиента
    const redirectUrl = clientRedirectUrls[client.client_id] || 'http://localhost:3001/';
    
    // Временно сохраняем для PKCE (будет удалено после callback)
    pkceStorage.set(state, { codeVerifier, nonce, redirectUrl });
    
    // Параметры авторизации
    const authUrl = client.authorizationUrl({
      redirect_uri: `http://localhost:${PORT}/callback`,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Callback от provider
app.get('/callback', async (req, res) => {
  try {
    const params = req.query;
    
    // Проверка наличия обязательных параметров
    if (!params.state) {
      return res.status(400).send(`
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Invalid callback: missing state parameter</h1>
            <p><a href="/auth">Try again</a></p>
          </body>
        </html>
      `);
    }
    
    // Получаем PKCE данные
    const pkceData = pkceStorage.get(params.state);
    if (!pkceData) {
      return res.status(400).send(`
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Invalid callback: PKCE data not found or expired</h1>
            <p><a href="/auth">Try again</a></p>
          </body>
        </html>
      `);
    }
    
    // Если есть ошибка от provider
    if (params.error) {
      pkceStorage.delete(params.state);
      return res.status(400).send(`
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Authentication Error</h1>
            <p><strong>Error:</strong> ${params.error}</p>
            <p><strong>Description:</strong> ${params.error_description || 'No description'}</p>
            <p><a href="/auth">Try again</a></p>
          </body>
        </html>
      `);
    }
    
    if (!params.code) {
      pkceStorage.delete(params.state);
      return res.status(400).send(`
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Invalid callback: missing code parameter</h1>
            <p><a href="/auth">Try again</a></p>
          </body>
        </html>
      `);
    }
    
    const { client } = await getClient();
    const { codeVerifier, nonce, redirectUrl } = pkceData;
    
    // Обмен кода на токены
    const tokenSet = await client.callback(
      `http://localhost:${PORT}/callback`,
      params,
      {
        code_verifier: codeVerifier,
        state: params.state,
        nonce,
      }
    );
    
    // Очищаем временные PKCE данные
    pkceStorage.delete(params.state);
    
    // Валидация токенов (openid-client делает это автоматически в callback)
    // Но можно дополнительно проверить
    const claims = tokenSet.claims();
    
    if (!claims || !claims.sub) {
      throw new Error('No sub claim in token');
    }
    
    console.log('Token set received:', {
      sub: claims.sub,
      access_token: tokenSet.access_token ? 'present' : 'absent',
      id_token: tokenSet.id_token ? 'present' : 'absent',
      refresh_token: tokenSet.refresh_token ? 'present' : 'absent',
    });
    
    // Создаем короткий session ID для хранения токена
    const sessionId = generators.random();
    tokenStorage.set(sessionId, tokenSet);
    
    // Редиректим на URL из конфигурации приложения с session ID
    const finalRedirectUrl = new URL(redirectUrl);
    finalRedirectUrl.searchParams.set('session', sessionId);
    res.redirect(finalRedirectUrl.toString());
  } catch (error) {
    console.error('Callback error:', error);
    
    // Очистка при ошибке
    if (req.query.state) {
      pkceStorage.delete(req.query.state);
    }
    
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error during authentication</h1>
          <p>${error.message}</p>
          <p><a href="/auth">Try again</a></p>
        </body>
      </html>
    `);
  }
});

// Главная страница и другие защищенные пути - требуют авторизации
app.get('/', requireAuth, async (req, res) => {
  try {
    const { token, tokenSet, tokenType, user } = req;
    const sessionId = req.query.session;
    
    // Если это access token, получаем дополнительную информацию через userinfo
    let userinfo = user;
    if (tokenType === 'access_token') {
      const { client } = await getClient();
      userinfo = await client.userinfo(token);
    }
    
    res.send(`
      <html>
        <head>
          <title>OIDC Client - Protected Page</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .success { color: green; }
            .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
            .warning { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; }
            pre { background: #eee; padding: 10px; border-radius: 3px; overflow-x: auto; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1 class="success">✓ Authenticated</h1>
          
          <div class="info">
            <h2>User Information:</h2>
            <pre>${JSON.stringify(userinfo, null, 2)}</pre>
          </div>
          
          <div class="info">
            <h2>Token Information:</h2>
            <p><strong>Token Type:</strong> ${tokenType}</p>
            <p><strong>User Role:</strong> <strong style="color: #28a745;">${userinfo.role || 'N/A'}</strong></p>
            <p><strong>Token:</strong> ${token.substring(0, 50)}...</p>
          </div>
          
          <div class="info">
            <h2>Test Admin Backend API:</h2>
            <p>Use the JWT token to call admin-backend API:</p>
            <pre style="font-size: 11px;">curl -H "Authorization: Bearer ${token}" http://localhost:3002/api/user</pre>
            ${userinfo.role === 'admin' ? `
              <pre style="font-size: 11px;">curl -H "Authorization: Bearer ${token}" http://localhost:3002/api/admin</pre>
            ` : ''}
            <pre style="font-size: 11px;">curl -H "Authorization: Bearer ${token}" http://localhost:3002/api/data</pre>
          </div>
          
          <div class="warning">
            <p><strong>Note:</strong> Token is validated on each request. Session ID is used to retrieve token from temporary storage.</p>
          </div>
          
          <p><a href="/logout?session=${sessionId}">Logout</a> | <a href="/?session=${sessionId}">Refresh</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/auth');
  }
});

// API endpoint для получения токена по session ID (для admin-ui)
app.get('/api/token', (req, res) => {
  const sessionId = req.query.session;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'session parameter required' });
  }
  
  const tokenSet = tokenStorage.get(sessionId);
  
  if (!tokenSet) {
    return res.status(404).json({ error: 'session not found or expired' });
  }
  
  // Возвращаем ID токен или access token
  const token = tokenSet.id_token || tokenSet.access_token;
  
  if (!token) {
    return res.status(404).json({ error: 'token not found' });
  }
  
  res.json({ token });
});

// Logout
app.get('/logout', (req, res) => {
  const sessionId = req.query.session;
  if (sessionId) {
    // Удаляем токен из хранилища
    tokenStorage.delete(sessionId);
  }
  res.redirect('/auth');
});

// Универсальный обработчик для других путей с session параметром
// Должен быть последним, чтобы не перехватывать специальные маршруты (/auth, /callback, /logout)
app.get('*', requireAuth, async (req, res) => {
  try {
    const { token, tokenSet, tokenType, user } = req;
    const sessionId = req.query.session;
    
    // Если это access token, получаем дополнительную информацию через userinfo
    let userinfo = user;
    if (tokenType === 'access_token') {
      const { client } = await getClient();
      userinfo = await client.userinfo(token);
    }
    
    // Простой ответ для других путей
    res.send(`
      <html>
        <head>
          <title>OIDC Client - Protected Page</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .success { color: green; }
            .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
            pre { background: #eee; padding: 10px; border-radius: 3px; overflow-x: auto; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1 class="success">✓ Authenticated</h1>
          <div class="info">
            <p><strong>Path:</strong> ${req.path}</p>
            <p><strong>User:</strong> ${userinfo.name || userinfo.sub}</p>
            <p><strong>Role:</strong> ${userinfo.role || 'N/A'}</p>
          </div>
          <p><a href="/logout?session=${sessionId}">Logout</a> | <a href="/?session=${sessionId}">Home</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/auth');
  }
});

app.listen(PORT, () => {
  console.log(`OIDC Client running at http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT} to start authentication`);
});
