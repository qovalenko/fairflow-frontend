# Rollout playbook: standalone microfrontends

Пошаговый operational-плейбук для миграции всего фронтенда на standalone runtime.

## Wave 1 (core CRM)

- Модули: `deals`, `contacts`, `activities`.
- Цель: подтвердить стабильность auth redirect, deep links и публикации `module-standalone`.
- Exit criteria:
  - 0 критических route regressions;
  - успешный smoke `/`, `/<module>/*`, `/<module>/:id`;
  - подтвержден rollback через переключение на remote build.

## Wave 2 (remaining business modules)

- Модули: `companies`, `orders`, `products`, `reports`, `documents`, `automation`, `statistics`.
- Цель: закрыть parity по маршрутам и стилям относительно legacy host flow.
- Exit criteria:
  - корректный auth redirect для всех приложений;
  - стабильные standalone артефакты в S3;
  - доступность index/chunks после публикации.

## Wave 3 (entrypoint cutover)

- Модули/точки входа: `landing` + маршруты входа через host thin-router.
- Цель: переключить основной трафик на standalone URL, оставить host как fallback launcher.
- Exit criteria:
  - переход без потери auth state;
  - нет роста 4xx/5xx по фронтовым URL;
  - подтвержден decommission plan для legacy federation runtime path.

## Rollback strategy

- Уровень 1 (module): переключить конкретный модуль обратно на `ci_artifacts/<module>` без standalone entrypoint.
- Уровень 2 (wave): откатить весь wave-префикс в S3 к предыдущему release snapshot.
- Уровень 3 (entrypoint): отключить thin-router и вернуть стандартный host runtime.

## Monitoring checklist

- Auth:
  - доля `401/419/440` после входа;
  - процент успешных return по `redirectUrl`.
- Routing:
  - 404 на deep links;
  - ошибки `You rendered descendant <Routes> ...`.
- Assets:
  - рост ошибок загрузки chunk/css;
  - корректность префиксов `frontend/<branch>/<module>[-standalone]`.

## Release checklist (per module)

- `npm run build` и `npm run build:standalone` проходят локально.
- В CI присутствуют `ci_artifacts/<module>` и `ci_artifacts/<module>-standalone`.
- Smoke на test:
  - `/frontend/main/<module>/`
  - `/frontend/main/<module>/<deep-link>`
  - login redirect + return.
