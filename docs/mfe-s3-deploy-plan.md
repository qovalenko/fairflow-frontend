# План деплоя фронта: независимые микрофронты через версионный S3 + манифест

Цель — **независимый деплой каждого микрофронта** (и host) с версионными артефактами в объектном хранилище, атомарным переключением и **per-module rollback**, без пересборки host при выкате модуля. Работает одинаково для стендов `test` и `app`.

## Принятые решения

- Артефакты — в бакете **`fairflow-frontend`** (MinIO сейчас, S3/CDN потом), приватный.
- **Клиенты ходят в бакет только через edge (Caddy сейчас).** Прямого доступа клиента в S3 нет.
- Развязка от edge — через **манифест**: host знает только относительные пути (`/fe-manifest.json`, `/frontend/...`). Сменить Caddy на что угодно = новый edge отдаёт те же относительные пути; host не трогаем.
- **Версионные префиксы `<artifact>/<sha>/`** → всё immutable (`max-age=1y`); `no-cache` только на двух мелких файлах на стенд: `index.html` и `fe-manifest.json`.
- Реализация host — **без миграции**: остаёмся на `@originjs/vite-plugin-federation`, ремоуты резолвятся в рантайме из манифеста (promise-based dynamic remotes). MF 2.0 — возможная эволюция позже.
- Контроль shared-версий (`react/react-dom/react-router/zustand/swr`) — единый контракт + CI-гард.

## Микрофронты

`contacts, companies, deals, orders, activities, products, reports, documents, automation, statistics, landing` (11) + **host** (оболочка).

## Раскладка бакета

```text
fairflow-frontend/
  host/<sha>/assets/...                       # immutable, общий для стендов
  contacts/<sha>/remoteEntry.js + assets/*    # immutable
  deals/<sha>/...                             # immutable
  ... (все 11 модулей) ...
  stands/test/index.html                      # no-cache; ссылается на /frontend/host/<sha>/assets/*
  stands/test/fe-manifest.json                # no-cache
  stands/app/index.html
  stands/app/fe-manifest.json
```

`fe-manifest.json`:
```json
{ "host": "<sha>",
  "remotes": {
    "contacts": "/frontend/contacts/<sha>/remoteEntry.js",
    "deals":    "/frontend/deals/<sha>/remoteEntry.js"
  } }
```
Артефакты модулей и host — **стенд-агностичны**; на стенд различаются только `index.html` и `fe-manifest.json` (какие `<sha>` выбраны). `test` может иметь более свежий `contacts`, чем `app`.

## Edge (Caddy сейчас; фронтит бакет)

На обоих vhost (`stand.example.com`, `app.example.com`):
```text
/                  → бакет stands/<stand>/index.html        (no-cache)
/fe-manifest.json  → бакет stands/<stand>/fe-manifest.json  (no-cache)
/frontend/*        → бакет (host/*, <mod>/*)                (immutable)
/api               → gateway (app→k3s NodePort, test→docker gateway)  [как сейчас]
/s3                → minio data buckets                                [как сейчас]
```
Кэш-заголовки выставляет edge: `Cache-Control: public, max-age=31536000, immutable` на `/frontend/*`; `no-cache` на `/` и `/fe-manifest.json`.

## Рантайм host

1. В бутстрапе (`index.html`/main) — `fetch('/fe-manifest.json')` (no-cache) → `window.__MF_MANIFEST__` до маунта.
2. Ремоуты в `host/vite.config.ts` объявляются как **promise-внешние**: промис читает `window.__MF_MANIFEST__.remotes[<mod>]` и делает `import(url)`.
3. `host/src/utils/loadRemoteModule.ts` и `routes.config` — без изменений (логика та же, URL приходит из манифеста).
4. Host собирается с base на свой версионный путь (`/frontend/host/<sha>/`).

## Поток деплоя и rollback

- **Деплой модуля** = залить `<mod>/<новый-sha>/` (immutable) → **затем** обновить одну строку `remotes.<mod>` в `fe-manifest.json` стенда. Атомарно (сначала артефакты, потом указатель).
- **Деплой host** = залить `host/<sha>/` (immutable) → обновить `stands/<stand>/index.html` (+ `host` в манифесте).
- **Rollback** (per-module или host) = вписать прежний `<sha>` в манифест/index.html. Артефакты лежат → мгновенно, без пересборок.
- **no-cache** только на `index.html` и `fe-manifest.json` → переключение видно сразу, остальное кэшируется навсегда.

## CI (репозиторий frontend)

- **per-module job** (`rules: changes: [modules/<mod>/**, shared-ui/**]`): build → publish `<mod>/<sha>/` → patch `remotes.<mod>` в манифесте. Независимый выкат.
- **host job** (`changes: [host/**, shared-ui/**]`): build → publish `host/<sha>/` → обновить `index.html` + `host` в манифесте.
- **full release** (manual): собрать всё, опубликовать, переписать манифест целиком (для согласованных релизов, напр. апгрейд shared).
- **rollback** (manual, параметры `module` + `sha`): патч манифеста.
- **shared-guard**: job валит сборку модуля, если его shared-версии разошлись с контрактом host.

## Артефакты/хранение

- CI-артефакт сборки (`dist`) — короткоживущий (для job'ы); **долговременный артефакт = версионный префикс в бакете** (он же даёт rollback).
- Lifecycle бакета: держим N последних `<sha>` на модуль/host, старые чистим (политика бакета / cron).

## Фазы внедрения

0. **Инфра**: бакет `fairflow-frontend`; правки Caddy (`/`, `/fe-manifest.json`, `/frontend/*` → бакет, кэш-заголовки) на обоих vhost.
1. **host**: рантайм-резолв ремоутов из манифеста (promise-remotes) + bootstrap-fetch манифеста.
2. **build/publish**: версионная сборка модулей и host в `<artifact>/<sha>/`; генератор/патчер манифеста.
3. **CI**: per-module + host + full + rollback + shared-guard.
4. **Cutover + cleanup**: переключить test и app на манифест; rollback-учения; lifecycle-чистка бакета.

## Гейты (нужно подтверждение/решение)

- **Запись в S3/MinIO из CI** — требует явного разрешения (правило репо). План — подготовка; заливки начинаем после «давай».
- Имя/доступ бакета (`fairflow-frontend`, приватный, отдаётся только через edge) — ок?
- Стартуем с Фазы 0 (бакет + Caddy + раздача текущей сборки из бакета как проверка), затем Фаза 1 (рантайм-манифест).
