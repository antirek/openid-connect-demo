import express from 'express';
import Provider from 'oidc-provider';
import { Issuer, generators } from 'openid-client';

const PORT = process.env.PORT || 3000;
const ISSUER = `http://localhost:${PORT}`;

// Список пользователей (в продакшене использовать БД)
const users = [
  { id: 'user1', name: 'User One', email: 'user1@example.com', password: 'pass1' },
  { id: 'user2', name: 'User Two', email: 'user2@example.com', password: 'pass2' },
  { id: 'admin', name: 'Admin User', email: 'admin@example.com', password: 'admin' },
];

// Список приложений (clients)
const applications = [
  { 
    client_id: 'demo-client', 
    name: 'Demo Application', 
    secret: 'demo-secret',
    redirect_url: 'http://localhost:3002/', // URL для переадресации после успешного логина
  },
  { 
    client_id: 'app2', 
    name: 'Application 2', 
    secret: 'app2-secret',
    redirect_url: 'http://localhost:3001/', // URL для переадресации после успешного логина
  },
  { 
    client_id: 'admin-ui', 
    name: 'Admin UI', 
    secret: 'admin-ui-secret',
    redirect_url: 'http://localhost:3002/', // URL для переадресации после успешного логина
  },
];

// Маппинг client_id -> redirect_url для быстрого доступа
const clientRedirectUrls = {};
applications.forEach(app => {
  clientRedirectUrls[app.client_id] = app.redirect_url;
});

// Маппинг: пользователь -> приложение -> роль
// В продакшене использовать БД с таблицей user_app_roles
const userAppRoles = {
  'user1': {
    'demo-client': 'user',
    'app2': 'viewer',
    'admin-ui': 'user',
  },
  'user2': {
    'demo-client': 'admin',
    'app2': 'user',
    'admin-ui': 'admin',
  },
  'admin': {
    'demo-client': 'admin',
    'app2': 'admin',
    'admin-ui': 'admin',
  },
};

// Конфигурация OIDC Provider
const configuration = {
  clients: applications.map(app => ({
    client_id: app.client_id,
    client_secret: app.secret,
    redirect_uris: [
      `http://localhost:${PORT}/client/callback`, // Callback для client flow (теперь в provider)
    ],
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'client_secret_basic',
  })),
  cookies: {
    keys: ['some-secret-key-change-in-production'],
  },
  features: {
    devInteractions: { enabled: true },
    claimsParameter: { enabled: true },
    clientCredentials: { enabled: true },
    introspection: { enabled: true },
    revocation: { enabled: true },
  },
  interactions: {
    url(ctx, interaction) {
      return `/interaction/${interaction.uid}`;
    },
  },
  claims: {
    openid: {
      sub: null,
      name: null,
      email: null,
      email_verified: null,
      role: null, // Добавляем роль в claims
    },
  },
  findAccount(ctx, id) {
    const user = users.find(u => u.id === id);
    if (!user) {
      return null;
    }
    
    return Promise.resolve({
      accountId: user.id,
      async claims(use, scope, claims, rejected) {
        // Получаем client_id из контекста или из grant
        let clientId = ctx.oidc?.client?.clientId;
        let role = null;
        
        // Если client_id не в контексте, пытаемся получить из grant
        if (!clientId && ctx.oidc?.grant) {
          const grant = await ctx.oidc.grant;
          clientId = grant?.clientId;
          
          // Пытаемся получить роль из grant metadata
          if (grant?.resourceServers?.[clientId]?.role) {
            role = grant.resourceServers[clientId].role;
          }
        }
        
        // Если роль не найдена в grant, получаем из маппинга
        if (!role && clientId) {
          role = userAppRoles[user.id]?.[clientId] || null;
        }
        
        return {
          sub: user.id,
          name: user.name,
          email: user.email,
          email_verified: true,
          role: role, // Добавляем роль в JWT
        };
      },
    });
  },
};

const app = express();

// Создаем OIDC Provider
const provider = new Provider(ISSUER, configuration);

// Middleware для парсинга body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Обработка взаимодействий (только логин, без consent)
app.use('/interaction/:uid', async (req, res, next) => {
  try {
    let details;
    try {
      details = await provider.interactionDetails(req, res);
    } catch (err) {
      // Если interaction не найден или истек, возвращаем ошибку
      if (err.name === 'SessionNotFound' || err.message?.includes('invalid_request') || err.code === 'invalid_request') {
        console.log('Interaction session not found or expired:', {
          uid: req.params.uid,
          error: err.name || err.code,
          message: err.message,
        });
        return res.status(400).send(`
          <html>
            <head>
              <title>Session Expired</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
                a { color: #007bff; text-decoration: none; }
                a:hover { text-decoration: underline; }
              </style>
            </head>
            <body>
              <h1>Session Expired</h1>
              <p>The authentication session has expired or is invalid. Please try again.</p>
              <p><a href="/">Go to home</a></p>
            </body>
          </html>
        `);
      }
      // Для других ошибок логируем и пробрасываем дальше
      console.error('Error in interaction handler:', err);
      throw err;
    }
    
    const { uid, prompt, params, session } = details;
    
    if (prompt.name === 'login') {
      // Форма логина
      if (req.method === 'GET') {
        return res.send(`
          <html>
            <head>
              <title>Login</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
                form { background: #f5f5f5; padding: 20px; border-radius: 5px; }
                input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
                button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; }
                button:hover { background: #0056b3; }
                .info { background: #e7f3ff; padding: 10px; border-radius: 5px; margin-bottom: 15px; }
              </style>
            </head>
            <body>
              <h1>Login</h1>
              <div class="info">
                <p><strong>Application:</strong> ${params.client_id}</p>
              </div>
              <form method="post">
                <input type="text" name="login" placeholder="Username" required><br>
                <input type="password" name="password" placeholder="Password" required><br>
                <button type="submit">Login</button>
              </form>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">
                Test users: user1/pass1, user2/pass2, admin/admin
              </p>
            </body>
          </html>
        `);
      }
      
      if (req.method === 'POST') {
        const { login, password } = req.body;
        
        // Проверка учетных данных
        const user = users.find(u => u.id === login && u.password === password);
        
        if (!user) {
          return res.send(`
            <html>
              <head><title>Login Failed</title></head>
              <body>
                <h1>Invalid credentials</h1>
                <p><a href="javascript:history.back()">Go back</a></p>
              </body>
            </html>
          `);
        }
        
        // Проверяем, есть ли у пользователя доступ к приложению
        const clientId = params.client_id;
        const role = userAppRoles[user.id]?.[clientId];
        
        if (!role) {
          return res.send(`
            <html>
              <head><title>Access Denied</title></head>
              <body>
                <h1>Access Denied</h1>
                <p>User "${user.id}" does not have access to application "${clientId}"</p>
                <p><a href="javascript:history.back()">Go back</a></p>
              </body>
            </html>
          `);
        }
        
        // Создаем grant с нужными scope и claims
        const grantId = session?.grantId;
        let grant = grantId ? await provider.Grant.find(grantId) : null;
        
        if (!grant) {
          grant = new provider.Grant({
            accountId: user.id,
            clientId: clientId,
          });
        }
        
        grant.addOIDCScope(params.scope || 'openid');
        grant.addOIDCClaims(['sub', 'name', 'email', 'email_verified', 'role']);
        
        // Сохраняем роль в grant metadata для использования в claims
        grant.resourceServers = grant.resourceServers || {};
        grant.resourceServers[clientId] = {
          role: role,
        };
        
        const savedGrantId = await grant.save();
        
        const result = {
          login: {
            accountId: user.id,
          },
          // Автоматически выдаем consent без экрана согласия
          consent: {
            grantId: savedGrantId,
          },
        };
        
        return provider.interactionFinished(req, res, result, {
          mergeWithLastSubmission: true,
        });
      }
    }
    
    // Если это consent prompt, автоматически разрешаем (не показываем экран)
    if (prompt.name === 'consent') {
      const grantId = session?.grantId;
      let grant = grantId ? await provider.Grant.find(grantId) : null;
      
      if (!grant) {
        grant = new provider.Grant({
          accountId: session.accountId,
          clientId: params.client_id,
        });
      }
      
      // Получаем роль пользователя для этого приложения
      const role = userAppRoles[session.accountId]?.[params.client_id] || null;
      
      grant.addOIDCScope(params.scope || 'openid');
      grant.addOIDCClaims(['sub', 'name', 'email', 'email_verified', 'role']);
      
      // Сохраняем роль в grant metadata
      grant.resourceServers = grant.resourceServers || {};
      grant.resourceServers[params.client_id] = {
        role: role,
      };
      
      const savedGrantId = await grant.save();
      
      const result = {
        consent: {
          grantId: savedGrantId,
        },
      };
      
      return provider.interactionFinished(req, res, result, {
        mergeWithLastSubmission: true,
      });
    }
    
    next();
  } catch (err) {
    next(err);
  }
});

// ========== OIDC Client функциональность ==========

// Временное хранилище для PKCE flow (только между началом авторизации и callback)
// Ключ - state, значение - { codeVerifier, nonce, redirectUrl, clientId }
const pkceStorage = new Map();

// Простое хранилище токенов по session ID (только для передачи токена после callback)
// Ключ - короткий session ID, значение - tokenSet
const tokenStorage = new Map();

// Получение или создание OIDC клиента для конкретного client_id
async function getOidcClient(clientId) {
  const app = applications.find(a => a.client_id === clientId);
  if (!app) {
    throw new Error(`Client ${clientId} not found`);
  }
  
  const issuer = await Issuer.discover(ISSUER);
  const client = new issuer.Client({
    client_id: app.client_id,
    client_secret: app.secret,
    redirect_uris: [`http://localhost:${PORT}/client/callback`],
    response_types: ['code'],
  });
  
  return { issuer, client };
}

// Начало процесса авторизации (OIDC Client)
app.get('/client/auth', async (req, res) => {
  try {
    const clientId = req.query.client_id || 'demo-client';
    const { client } = await getOidcClient(clientId);
    
    // Генерация code_verifier и code_challenge для PKCE
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    
    // Генерация state и nonce
    const state = generators.random();
    const nonce = generators.random();
    
    // Получаем redirect_url для этого клиента
    const redirectUrl = clientRedirectUrls[clientId] || 'http://localhost:3001/';
    
    // Временно сохраняем для PKCE (будет удалено после callback)
    pkceStorage.set(state, { codeVerifier, nonce, redirectUrl, clientId });
    
    // Параметры авторизации
    const authUrl = client.authorizationUrl({
      redirect_uri: `http://localhost:${PORT}/client/callback`,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('Client auth error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Callback от provider (OIDC Client) - используем отдельный путь
app.get('/client/callback', async (req, res) => {
  try {
    const params = req.query;
    
    // Проверка наличия обязательных параметров
    if (!params.state) {
      return res.status(400).send(`
        <html>
          <head><title>Error</title></head>
          <body>
            <h1>Invalid callback: missing state parameter</h1>
            <p><a href="/client/auth">Try again</a></p>
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
            <p><a href="/client/auth">Try again</a></p>
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
            <p><a href="/client/auth">Try again</a></p>
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
            <p><a href="/client/auth">Try again</a></p>
          </body>
        </html>
      `);
    }
    
    const { client } = await getOidcClient(pkceData.clientId);
    const { codeVerifier, nonce, redirectUrl } = pkceData;
    
    // Обмен кода на токены
    const tokenSet = await client.callback(
      `http://localhost:${PORT}/client/callback`,
      params,
      {
        code_verifier: codeVerifier,
        state: params.state,
        nonce,
      }
    );
    
    // Очищаем временные PKCE данные
    pkceStorage.delete(params.state);
    
    // Валидация токенов
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
    
    // Получаем токен (ID токен или access token)
    const token = tokenSet.id_token || tokenSet.access_token;
    
    // Редиректим на URL из конфигурации приложения с токеном в query
    const finalRedirectUrl = new URL(redirectUrl);
    finalRedirectUrl.searchParams.set('token', token);
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
          <p><a href="/client/auth">Try again</a></p>
        </body>
      </html>
    `);
  }
});

// Подключаем OIDC Provider routes (после client routes)
app.use(provider.callback());

// API endpoint для получения токена по session ID
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', issuer: ISSUER });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`OIDC Provider + Client running at ${ISSUER}`);
  console.log(`Discovery: ${ISSUER}/.well-known/openid-configuration`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /client/auth        - Start OIDC client flow`);
  console.log(`  GET  /client/callback    - OIDC client callback`);
  console.log(`  GET  /api/token          - Get JWT token by session ID`);
  console.log(`  GET  /health             - Health check`);
  console.log(`\nTest users:`);
  users.forEach(user => {
    console.log(`  ${user.id} / ${user.password}`);
  });
  console.log(`\nUser roles per application:`);
  Object.entries(userAppRoles).forEach(([userId, apps]) => {
    console.log(`  ${userId}:`);
    Object.entries(apps).forEach(([appId, role]) => {
      console.log(`    ${appId} -> ${role}`);
    });
  });
});
