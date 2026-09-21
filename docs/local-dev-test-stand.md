# Локальная разработка фронтенда против test-стенда

Три режима — от лёгкого до тяжёлого.

## Режим A: host локально, все remotes с test

Используй, когда правишь только host (роутинг, лейаут, общие компоненты).

### `host/.env.local`

```dotenv
VITE_REMOTES_BASE_URL=https://stand.example.com/frontend/main
VITE_API_PROXY_TARGET=https://stand.example.com
VITE_AUTH_PERSIST_STRATEGY=localStorage
VITE_API_PREFIX=/api
```

### Запуск

```bash
cd frontend/host
npm run dev
```

## Режим B (рекомендуемый): host + выбранные remotes локально

Основной режим — поднимаешь только те модули, которые сейчас правишь.
Остальные remotes грузятся с `stand.example.com`.

```bash
cd frontend/host

# Один модуль
./dev-hybrid.sh contacts

# Несколько модулей
./dev-hybrid.sh contacts deals landing
```

Скрипт:

1. Билдит указанные модули (`npm run build`)
2. Поднимает `vite preview` для них на их портах (5011–5021)
3. Запускает host (`npm run dev`) — API проксируется на `https://stand.example.com`

Те remotes, которые не перечислены, загружаются с `https://stand.example.com/frontend/main/`.

### Ручной запуск (без скрипта)

```bash
# Терминал 1 — собрать и запустить нужный модуль
cd frontend/modules/contacts && npm run build && npm run preview

# Терминал 2 — host
cd frontend/host
VITE_REMOTES_BASE_URL=https://stand.example.com/frontend/main \
VITE_LOCAL_REMOTES=contacts \
VITE_API_PROXY_TARGET=https://stand.example.com \
VITE_AUTH_PERSIST_STRATEGY=localStorage \
VITE_API_PREFIX=/api \
npm run dev
```

## Режим C: host + все remotes локально

Требует много ресурсов (11 модулей + host).

```bash
cd frontend/host
./dev-all-local-remotes-test-gateway.sh
```

## Режим D: standalone модуль (пилот `activities`)

Запуск отдельного атомарного приложения без host. Модуль остается federation-remote, но дополнительно имеет собственный bootstrap UI.

```bash
cd frontend/modules/activities
npm ci
VITE_AUTH_PERSIST_STRATEGY=localStorage \
VITE_API_PREFIX=/api \
VITE_STANDALONE_LOGIN_URL=https://stand.example.com/auth/signin \
VITE_STANDALONE_CRM_URL=https://stand.example.com \
npm run dev:standalone
```

По умолчанию доступны оба пути:

- `/` — standalone activities
- `/activities/*` — тот же модуль, совместимый с host-роутингом

Если сессии нет, модуль отправляет на login с `redirectUrl` и возвращает обратно после входа.

Дополнительно для standalone:

- `VITE_STANDALONE_LOGIN_REDIRECT=true` — принудительный внешний redirect на login (prod-like).
- `VITE_STANDALONE_SKIP_AUTH=true` — отключить guard для локального UI smoke.
- token bootstrap: `http://localhost:5015/?accessToken=<JWT>` (удобно для dev без полного login-flow).

## Порты модулей

| Модуль      | Порт |
|-------------|------|
| contacts    | 5011 |
| companies   | 5012 |
| deals       | 5013 |
| orders      | 5014 |
| activities  | 5015 |
| products    | 5016 |
| reports     | 5017 |
| documents   | 5018 |
| automation  | 5019 |
| statistics  | 5020 |
| landing     | 5021 |

## Почему в dev выбран `localStorage`

- На test cookie авторизация привязана к домену `stand.example.com`.
- Для `localhost` это часто мешает (SameSite/Secure/CORS ограничения).
- `VITE_AUTH_PERSIST_STRATEGY=localStorage` убирает зависимость от cross-site cookies и ускоряет dev-цикл.

## Thin host режим (launcher)

Если нужен host без embedded federation-рендеринга, включите:

```bash
cd frontend/host
VITE_HOST_THIN_ROUTER=true npm run dev
```

В этом режиме host работает как launchpad/redirector в standalone URL модулей.
