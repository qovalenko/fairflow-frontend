# Тестовые пользователи

Тестовые учётки **не хранятся в репозитории** — они создаются сидом и живут
в вашем окружении.

## Откуда берутся

Источник правды — сиды backend:

- `scripts/data/auth-users.seed.json` — список пользователей;
- `npm run db:seed:auth-users` (или `npm run seed:all`) — применяет их.

Посмотреть, какие логины созданы у вас, можно прямо в этом файле после
клонирования backend-репозитория.

## Как логиниться

- Endpoint: `POST /api/v1/auth/login`
- Поле: `login` (или `email`) + `password`

## Для e2e

Playwright берёт учётку из переменных окружения, а не из этого файла:

```bash
E2E_EMAIL=<login> E2E_PASSWORD=<password> npx playwright test
```

Дефолты и остальные переменные — в [e2e/.env.example](../e2e/.env.example).
Свой `.env` не коммить: он в `.gitignore`.
