import express from 'express';
import Provider from 'oidc-provider';

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
    redirect_url: 'http://localhost:3001/', // URL для переадресации после успешного логина
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
    redirect_url: 'http://localhost:3003/', // URL для переадресации после успешного логина
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
      `http://localhost:3001/callback`, // Основной callback для всех клиентов
      ...(app.client_id === 'admin-ui' ? [`http://localhost:3003/callback`] : []), // Специальный callback для admin-ui
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
    const details = await provider.interactionDetails(req, res);
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

// Подключаем OIDC Provider routes
app.use(provider.callback());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', issuer: ISSUER });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`OIDC Provider running at ${ISSUER}`);
  console.log(`Discovery: ${ISSUER}/.well-known/openid-configuration`);
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
