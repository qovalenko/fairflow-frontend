# Fairflow Host (UI Shell)

Оболочка Fairflow CRM на React 19 + Vite 7 + Module Federation.

## Назначение

- Загрузка и маршрутизация federated remotes (`host/vite.config.ts`, `/fe-manifest.json`).
- Проектный контекст (`x-project-id`), навигация и слоты (`Slot`, `SLOT_CATALOG`).
- Гейтинг прав через API-2 (`usePermissionProjection`) — без локального RBAC на FE.
- Chrome: header, side nav, project selector, visibility scope, error boundaries.

## Разработка

```bash
cd host
npm run dev
```

Гибрид с тестовым стендом: `../host/dev-hybrid.sh contacts deals`

## Ключевые каталоги

| Путь | Роль |
|------|------|
| `src/configs/slot-catalog.config.ts` | Re-export `@fairflow/slot-catalog` (shared) |
| `src/configs/module-nav.config.ts` | Меню и `ROUTE_TO_MODULE` |
| `src/utils/hooks/usePlatformModules.ts` | Манифест модулей (`GET /api/v1/platform/modules`) |
| `src/components/shared/Slot.tsx` | Рендер mount-points |
| `src/components/shared/RemoteModuleErrorBoundary.tsx` | Изоляция падений remotes |

## Тесты

```bash
npm run test
npx tsc --noEmit
```

## BOX edition

Биллинг и Organization в оболочке отсутствуют. JWT проверяется на gateway; домены — только gRPC.
