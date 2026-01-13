# OpenID Connect Demo

Демонстрационный проект OpenID Connect с использованием `oidc-provider` и npm workspaces.

## Архитектура

Проект состоит из трех компонентов:

- **`packages/provider`** - OIDC Provider (авторизационный сервер)
  - Список пользователей
  - Список приложений (clients)
  - Маппинг пользователь -> приложение -> роль
  - Выдает JWT токены с ролью пользователя для конкретного приложения

- **`packages/client`** - OIDC Client (веб-приложение)
  - Получает JWT токен от provider
  - Сохраняет токен
  - Отображает информацию о пользователе и роли

- **`packages/admin-backend`** - Admin Backend API с JWT валидацией
  - Middleware для валидации JWT токенов
  - Проверка ролей пользователей
  - Защищенные endpoints

- **`packages/admin-ui`** - Admin UI на Vue.js 3 (Composition API)
  - Веб-интерфейс для работы с admin-backend API
  - Аутентификация через OIDC
  - Отображение данных пользователя
  - Управление данными (создание, просмотр)
  - Доступ к admin endpoints (для пользователей с ролью admin)

## Установка

```bash
npm install
```

## Запуск

### Запуск всех сервисов одновременно

```bash
npm run start:all
```

Или для разработки с автоперезагрузкой:

```bash
npm run dev:all
```

### Запуск отдельных сервисов

```bash
# Provider (порт 3000)
npm run start:provider

# Client (порт 3001)
npm run start:client

# Admin Backend (порт 3002)
npm run start:admin-backend

# Admin UI (порт 3003)
npm run start:admin-ui
```

## Использование

1. Запустите все сервисы: `npm run start:all`
2. Откройте браузер и перейдите на:
   - `http://localhost:3001` - Client приложение
   - `http://localhost:3003` - Admin UI
3. Вы будете перенаправлены на страницу логина provider
4. Войдите с одним из тестовых пользователей (см. ниже)
5. После успешного входа вы получите JWT токен с ролью пользователя для этого приложения
6. Используйте токен для вызова admin-backend API или работы через Admin UI

## Тестовые пользователи

- `user1` / `pass1` - роль `user` в `demo-client` и `admin-ui`
- `user2` / `pass2` - роль `admin` в `demo-client` и `admin-ui`
- `admin` / `admin` - роль `admin` во всех приложениях

## Маппинг пользователей и ролей

Настроен в `packages/provider/index.js`:

```javascript
const userAppRoles = {
  'user1': {
    'demo-client': 'user',
  },
  'user2': {
    'demo-client': 'admin',
  },
  'admin': {
    'demo-client': 'admin',
  },
};
```

## URL переадресации после логина

Каждое приложение может иметь свой URL для переадресации после успешного логина. Настроено в `packages/provider/index.js`:

```javascript
const applications = [
  { 
    client_id: 'demo-client', 
    name: 'Demo Application', 
    secret: 'demo-secret',
    redirect_url: 'http://localhost:3001/', // URL для переадресации после успешного логина
  },
];
```

После успешной аутентификации пользователь будет перенаправлен на этот URL с параметром `session`, содержащим session ID для доступа к токену.

## Admin Backend API

Admin Backend API доступен на `http://localhost:3002`:

### Endpoints

- `GET /health` - Публичный health check
- `GET /api/user` - Информация о пользователе (требует JWT)
- `GET /api/admin` - Только для admin (требует JWT + роль admin)
- `GET /api/data` - Защищенные данные (требует JWT + роль admin или user)
- `POST /api/data` - Создание данных (требует JWT + роль admin или user)

### Пример использования

```bash
# Получить информацию о пользователе
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:3002/api/user

# Доступ только для admin
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:3002/api/admin

# Защищенные данные
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:3002/api/data
```

## Flow аутентификации

1. **Client** редиректит пользователя на **Provider** с `client_id`
2. **Provider** показывает форму логина
3. После успешного логина **Provider**:
   - Проверяет маппинг пользователь -> приложение -> роль
   - Если пользователь имеет доступ к приложению, создает JWT с ролью
   - Редиректит обратно в **Client** с authorization code
4. **Client** обменивает code на JWT токен
5. **Client** сохраняет JWT токен
6. Все запросы к **Admin Backend** идут с JWT в заголовке `Authorization: Bearer <token>`
7. **Admin Backend** валидирует JWT через middleware:
   - Проверяет подпись
   - Проверяет срок действия
   - Проверяет issuer и audience
   - Извлекает роль пользователя
8. Если JWT валиден - запрос обрабатывается, иначе возвращается 401

## Особенности

- **Нет экрана согласия (consent)** - доступ определяется маппингом ролей
- **Роль в JWT** - каждый JWT содержит роль пользователя для конкретного приложения
- **Stateless валидация** - admin-backend валидирует JWT без обращения к provider
- **Проверка ролей** - middleware может проверять роли для доступа к endpoints

## Технологии

- **oidc-provider** - OIDC Provider библиотека для Node.js
- **openid-client** - OIDC Client библиотека для Node.js
- **Express** - Web framework для Node.js
- **npm workspaces** - Управление монорепозиторием

## Примечания

Это демонстрационный проект для изучения OpenID Connect. Для production использования необходимо:

- Использовать безопасное хранилище для пользователей и маппинга ролей (БД)
- Реализовать реальную аутентификацию пользователей
- Настроить HTTPS
- Использовать безопасные ключи для подписи токенов
- Реализовать правильное управление секретами клиентов
- Добавить логирование и мониторинг
- Реализовать refresh token flow
- Добавить rate limiting