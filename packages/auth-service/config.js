// Конфигурация OIDC Provider
// В продакшене использовать БД вместо статических данных

// Список пользователей (в продакшене использовать БД)
export const users = [
  { id: 'user1', name: 'User One', email: 'user1@example.com', password: 'pass1' },
  { id: 'user2', name: 'User Two', email: 'user2@example.com', password: 'pass2' },
  { id: 'admin', name: 'Admin User', email: 'admin@example.com', password: 'admin' },
];

// Список приложений (clients)
export const applications = [
  { 
    client_id: 'demo-client', 
    name: 'Demo Application', 
    secret: 'demo-secret',
    redirect_url: 'http://localhost:3002/', // URL для переадресации после успешного логина
  },
  { 
    client_id: 'filebump-admin', 
    name: 'Application 2', 
    secret: 'app2-secret',
    redirect_url: 'http://localhost:33033/', // URL для переадресации после успешного логина
  },
  { 
    client_id: 'admin-ui', 
    name: 'Admin UI', 
    secret: 'admin-ui-secret',
    redirect_url: 'http://localhost:3002/', // URL для переадресации после успешного логина
  },
];

// Маппинг: пользователь -> приложение -> роль
// В продакшене использовать БД с таблицей user_app_roles
export const userAppRoles = {
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
    'filebump-admin': 'admin',
  },
};

// Маппинг client_id -> redirect_url для быстрого доступа
export function createClientRedirectUrls(applications) {
  const clientRedirectUrls = {};
  applications.forEach(app => {
    clientRedirectUrls[app.client_id] = app.redirect_url;
  });
  return clientRedirectUrls;
}

// Создание конфигурации OIDC Provider
export function createProviderConfiguration(port, users, applications, userAppRoles) {
  return {
    clients: applications.map(app => ({
      client_id: app.client_id,
      client_secret: app.secret,
      redirect_uris: [
        `http://localhost:${port}/client/callback`, // Callback для client flow (теперь в provider)
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
}
