/**
 * Остатки admin-шаблона (`/notification/count`, `/notification/list` без `/v1`)
 * удалены: потребителей у них не было, а типы разошлись с контрактом gateway —
 * `GET /v1/notification/list` отдаёт `{list,total}`, а не голый массив
 * (common-bff.controller). Каноничные клиенты уведомлений —
 * `@/services/NotificationService` (`apiGetNotificationCount`/`apiGetNotificationList`),
 * их и используют `useNotifications` / `NotificationsPage`.
 *
 * TODO-259: `apiGetSearchResult` удалён по той же причине. Его сигнатура
 * (`{ query }` без `projectId`, ответ типизирован как массив секций) расходилась
 * с `GET /api/search/query`, который отдаёт `{ groups, total, total_by_type }` и
 * резолвит проект из `?projectId` / заголовка `X-Project-Id`
 * (`resolveSearchProjectId`, common-bff.controller.ts). Каноничный клиент поиска —
 * `@/services/SearchService` (`apiSearchQuery`), его использует и шапка
 * (`components/template/Search.tsx`), и модуль `modules/search`.
 */

export {}
