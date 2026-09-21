# Fairflow — Frontend

Фронтенд проектно-центричной модульной CRM-платформы Fairflow: оболочка
(host) плюс микрофронтенды, собранные через Module Federation.

Серверная часть — в репозитории `fairflow-backend`; общая архитектура,
модель gRPC-взаимодействия и ролевая модель описаны там в `docs/`.

## Стек

React 19, TypeScript, Vite 7, Module Federation, Tailwind.

## Как устроено

```text
host/                 оболочка: роутинг, авторизация, лэйаут, слоты
modules/<name>/       микрофронтенд-ремоут
```

Модули: `contacts`, `companies`, `deals`, `orders`, `activities`, `products`,
`reports`, `documents`, `automation`, `statistics`, `search`, `chat`.

Host грузит ремоуты по конфигу федерации (`host/vite.config.ts`). Dev-порты
ремоутов — 5011…5022, host — 5173.

Каждый модуль умеет работать **в двух режимах**:

- как федерированный remote внутри host;
- **standalone** — собственный entrypoint и `index.html`
  (`VITE_STANDALONE_MODE=true`). Про миграцию — `docs/standalone-rollout-playbook.md`
  и `docs/standalone-mfe-template.md`.

## ⚠️ Внешние зависимости репозитория

Репозиторий **не самодостаточен**: он рассчитан на соседние каталоги.

1. **`@fairflow/shared-ui`** — общая UI-библиотека. В этот репозиторий не
   входит: `host` подключает её как `file:`-зависимость соседнего каталога,
   модули — из приватного npm-registry.
2. **`@fairflow/slot-catalog`** — каталог слотов, который берётся прямо из
   исходников backend (`backend/shared/src/slot-catalog.ts`) через алиас в
   `tsconfig` и конфигах Vitest.

Ожидаемая раскладка на диске:

```text
<root>/
  backend/      репозиторий fairflow-backend
  frontend/     этот репозиторий
  shared-ui/    библиотека shared-ui
```

Если клонировать репозитории под их именами на GitHub
(`fairflow-backend` / `fairflow-frontend`), относительные пути не сойдутся —
каталоги нужно переименовать либо связать симлинками.

Практическое следствие: `npm install` и сборка «из коробки» после одного
клонирования не пройдут. Код при этом полный и читаемый — не хватает только
этих внешних частей.

## Запуск

```bash
# host (из host/)
npm run dev                   # host + ремоуты по конфигу
npm run build
npm run typecheck             # tsc --noEmit
npm run lint
npm run format                # prettier:fix + lint:fix

# модуль (из modules/<name>/)
npm run dev                   # как remote
npm run dev:standalone        # standalone
npm run build / build:standalone
```

Гибридный режим — часть модулей локально, остальные с развёрнутого стенда:

```bash
./host/dev-hybrid.sh contacts deals    # contacts+deals локально
./host/dev-hybrid.sh                   # только host
```

## Тесты

Юнит- и компонентные тесты — Vitest, по конфигу в каждом модуле и в host
(`host/testing/`). Сквозные — Playwright в `e2e/`.

```bash
npm run test                  # vitest (в host/ или в модуле)
cd e2e && npx playwright test # e2e
```

Переменные e2e (`BASE_URL`, учётка, флаги наборов) — в
[e2e/.env.example](e2e/.env.example); свой `.env` не коммитится. По умолчанию
тесты бьют в локальный host (`http://localhost:5173`); чтобы проверять
развёрнутый стенд, задайте `BASE_URL` и `STAND_URL`.

Отдельная оговорка про qa-id: прод-сборка вырезает атрибуты `data-qa-id`,
поэтому набор, который на них опирается, зелёный только в гибридном режиме с
локально поднятым ремоутом.
