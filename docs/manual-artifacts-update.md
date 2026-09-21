# Обновление фронтенд-артефактов без «деплоя» через CI

Под «деплоем» здесь имеется в виду **GitLab CI job `publish:s3`** и любая автоматическая выгрузка в MinIO. Ниже — как обновить статику на тестовом домене **вручную**, с локальной машины, когда код уже собран.

## Что куда попадает

- Бакет: `frontend-artifacts` (endpoint: `https://s3.example.com`).
- Префикс для ветки `main` на тестовом стенде: `frontend/main/` (см. `FRONTEND_PUBLIC_PATH_ROOT` и `CI_COMMIT_REF_SLUG` в `.gitlab-ci.yml`).
- Хост SPA и remotes: объекты под `s3://frontend-artifacts/frontend/main/host/`, `.../landing/`, и т.д.
- Публичный origin для браузера: `https://stand.example.com` (Nginx на `ac` проксирует на тот же префикс в бакете).

## Когда имеет смысл ручная выгрузка

- Нужно быстрее, чем дождаться pipeline и ручного `publish:s3`.
- CI недоступен или job пропущен.
- Проверка фикса до мержа в основную ветку (тогда лучше собрать с нужным `VITE_*` и залить в **отдельный** префикс ветки, не перетирая `main`).

## Предварительные условия

1. Установлен AWS CLI v2 **или** `awscli` (v1), настроенные переменные доступа к MinIO (как в CI-переменных, не коммитить).
2. Локально собран артефакт:
   - только хост: `cd frontend/host && npm ci && npm run build` → каталог `host/build/`;
   - полный набор как в CI: скрипт `build:frontend` в CI-конфигурации (host + модули в `ci_artifacts/`).

3. Для Module Federation в прод-сборке задайте переменные окружения так же, как в CI (путь публичного URL без привязки к S3):

   - `VITE_FRONTEND_PUBLIC_PATH` — например `/frontend/main` для ветки `main`;
   - `VITE_REMOTES_BASE_URL` — например `https://stand.example.com/frontend/main`.

## Выгрузка только хоста (типичный случай после правок shell/CSS)

Из корня репозитория, после `npm run build` в `frontend/host`:

```bash
export AWS_ACCESS_KEY_ID="…"
export AWS_SECRET_ACCESS_KEY="…"
export AWS_DEFAULT_REGION="us-east-1"

aws --endpoint-url https://s3.example.com s3 sync \
  frontend/host/build/ \
  s3://frontend-artifacts/frontend/main/host/ \
  --delete
```

`--delete` удаляет на S3 файлы, которых больше нет в локальной сборке (аккуратно: не путайте префикс).

## Полная синхронизация каталога артефактов

Если у вас уже есть каталог `frontend/ci_artifacts/` в структуре как после CI (`host/`, `landing/`, …):

```bash
aws --endpoint-url https://s3.example.com s3 sync \
  frontend/ci_artifacts/ \
  s3://frontend-artifacts/frontend/main/ \
  --delete
```

## После выгрузки на сервере `ac`

Nginx может кэшировать ответы S3. Очистить кэш в контейнере и перезагрузить Nginx:

```bash
ssh ac "docker exec fairflow-test-nginx find /var/cache/nginx/s3 -type f -delete && docker exec fairflow-test-nginx nginx -s reload"
```

## CRM и лендинг (фон страницы)

Глобальные стили хоста (`html`, `#root`, `body` в `host/src/assets/styles/tailwind/index.css`) по-прежнему задают **тёмный фон** для основного приложения CRM. Светлая тема на **лендинге** (микрофронт `modules/landing`) делается **только внутри лендинга** (полноэкранная белая подложка при светлой теме), без смены глобального фона под CRM.

## Чего не делать без согласования

- Не перезаписывайте префикс `frontend/main/`, если тестируете другую ветку — используйте префикс с `CI_COMMIT_REF_SLUG` (например `frontend/feature-foo/`).
- Не коммитьте ключи MinIO в репозиторий.

## Связь с Cursor rule

В проекте задано правило: **агент не выгружает в S3 без явного разрешения пользователя**. Ручные шаги из этой инструкции выполняет человек или агент **только после явной команды** «залить в S3» / «обновить артефакты».
