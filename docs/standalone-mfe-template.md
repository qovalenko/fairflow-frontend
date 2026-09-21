# Шаблон тиражирования standalone + federation для CRM модулей

Этот шаблон использует пилот `activities` как эталон и позволяет добавить dual-mode в любой модуль (`contacts`, `companies`, `deals`, `orders`, `products`, `reports`, `documents`, `automation`, `statistics`, `landing`).

## 1) Entry points

- Убедиться, что в модуле есть `index.html` с `<div id="root"></div>`.
- В `src/vite-entry.ts` оставить тонкую точку входа:
  - `import './vite-entry-app'`
- В `src/vite-entry-app.tsx` рендерить standalone app:
  - общий `StandaloneModuleApp` (host `@/components/template/StandaloneModuleApp`)
  - или эквивалент с `Theme` + `BrowserRouter` + `AuthProvider` + guard.

## 2) Federation compatibility

- В `vite.config.ts` оставить текущий `exposes` без breaking changes.
- Не менять имя remote и export контракт (например `./ActivitiesModule`).
- `shared` зависимости держать singleton (`react`, `react-dom`, `react-router`, `zustand`, `swr`).

## 3) Auth контракт (JWT/localStorage)

- Запускать standalone со стратегией:
  - `VITE_AUTH_PERSIST_STRATEGY=localStorage`
- Guard должен:
  - проверять `authenticated` через `useAuth()`,
  - редиректить на login c `redirectUrl`,
  - после `401` полагаться на общий logout flow из axios interceptors и повторный guard redirect.
- Для dev/preview допускается token bootstrap (`?accessToken=...`, `#accessToken=...`),
  но для prod редирект на login должен быть включен по умолчанию.

Рекомендуемые env:

- `VITE_STANDALONE_LOGIN_URL` (по умолчанию `/auth/signin`)
- `VITE_STANDALONE_CRM_URL` (ссылка в полный CRM host)
- `VITE_STANDALONE_BASENAME` (если модуль живет не в `/`)

## 4) Scripts

Добавить в `package.json` модуля:

```json
{
  "scripts": {
    "dev:standalone": "VITE_STANDALONE_MODE=true VITE_AUTH_PERSIST_STRATEGY=localStorage vite",
    "build:standalone": "VITE_STANDALONE_MODE=true VITE_AUTH_PERSIST_STRATEGY=localStorage vite build",
    "preview:standalone": "VITE_STANDALONE_MODE=true VITE_AUTH_PERSIST_STRATEGY=localStorage vite preview"
  }
}
```

## 5) CI smoke checks

- В `verify` этапе проверить, что standalone и remote артефакты собираются:
  - `dist/index.html`
  - `dist/assets/remoteEntry.js`
- В `build` этапе публиковать:
  - `ci_artifacts/<module>` как remote build;
  - `ci_artifacts/<module>-standalone` как standalone build (для прямого входа).

## 6) Smoke checklist перед тиражированием

- Модуль открывается в standalone (`/` и `/<module>/*`).
- Login redirect и возврат через `redirectUrl` работают.
- Deep links (`/<module>/:id`) работают.
- В host модуль продолжает грузиться как remote без регрессий.
- `npm run build` и `npm run build:standalone` проходят локально.
