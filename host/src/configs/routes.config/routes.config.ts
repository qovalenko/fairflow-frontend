import { lazy } from 'react'
import authRoute from './authRoute'
import othersRoute from './othersRoute'
import type { Routes } from '@/@types/routes'
import { lazyRemote } from '@/utils/loadRemoteModule'

export const publicRoutes: Routes = [
    // Лендинг вынесен в отдельный проект;
    // the stand — только приложение. Рут неавторизованного → логин, авторизованного → Home.
    ...authRoute,
    // Box: устаревший OrgSetup (/auth/signup/organization) удалён — recovery-создание
    // единственной организации живёт на /onboarding/organization (OrgSetupRecovery, BX-ONB-2).
    {
        key: 'verifyEmail',
        path: '/auth/verify-email/:token',
        component: lazy(() => import('@/views/auth/VerifyEmail')),
        authority: [],
        meta: { pageTitle: 'Подтверждение email' },
    },
    {
        key: 'twoFactorAuth',
        path: '/auth/2fa',
        component: lazy(() => import('@/views/auth/TwoFactorAuth')),
        authority: [],
        meta: { pageTitle: 'Двухфакторная аутентификация' },
    },
    {
        key: 'inviteAccept',
        path: '/auth/invite/:token',
        component: lazy(() => import('@/views/auth/InviteAccept')),
        authority: [],
        meta: { pageTitle: 'Приглашение в команду' },
    },
    {
        key: 'projectInviteAccept',
        path: '/auth/project-invite/:token',
        component: lazy(() => import('@/views/auth/ProjectInviteAccept')),
        authority: [],
        meta: { pageTitle: 'Приглашение в проект' },
    },
    // Verify email reachable also without a path-token (query `?token=`).
    {
        key: 'verifyEmail.query',
        path: '/auth/verify-email',
        component: lazy(() => import('@/views/auth/VerifyEmail')),
        authority: [],
        meta: { pageTitle: 'Подтверждение email' },
    },
    // SCR-AUTH-BACKUP-CODE — closes the dangling /auth/backup-code link.
    {
        key: 'backupCode',
        path: '/auth/backup-code',
        component: lazy(() => import('@/views/auth/BackupCode')),
        authority: [],
        meta: { pageTitle: 'Резервный код' },
    },
    // SCR-MPROF-EMAIL-CONFIRM — public deep-link to confirm a new email.
    {
        key: 'account.email.confirm',
        path: '/account/email/confirm',
        component: lazy(() => import('@/views/account/Profile/EmailConfirm')),
        authority: [],
        meta: { pageTitle: 'Подтверждение email' },
    },
    // SCR-MPROF-EMAIL-CANCEL — public deep-link from the security-alert email
    // (sent to the CURRENT address) to cancel a pending email change.
    {
        key: 'account.email.cancel',
        path: '/account/email/cancel',
        component: lazy(() => import('@/views/account/Profile/EmailCancel')),
        authority: [],
        meta: { pageTitle: 'Отмена смены email' },
    },
    // SCR-MPROF-LOGOUT-FORCED — forced sign-out / re-auth (ST-21).
    {
        key: 'account.logoutForced',
        path: '/account/logout-forced',
        component: lazy(() => import('@/views/account/LogoutForced')),
        authority: [],
        meta: { pageTitle: 'Сессия завершена' },
    },
]

/** Префикс только для настроек проекта; контент портфеля — без /p в URL, контекст в store/localStorage */
const P_SETTINGS = '/p/:pid'

export const protectedRoutes: Routes = [
    // Onboarding
    // Легаси мок-цепочка (ProfileSetup → FirstProject → InviteTeam) удалена:
    // эти onSubmit были console.log без API, а InviteTeam вёл в тупик на /p/1.
    // Реальный путь онбординга — /onboarding (ProjectEntryChoice → CreateProject).
    // Старые URL редиректим, чтобы не ломать ссылки из писем/закладок.
    {
        key: 'onboarding.profile.legacy',
        path: '/onboarding/profile',
        component: lazy(() => import('@/views/onboarding/RedirectToOnboarding')),
        authority: [],
        meta: { pageTitle: 'Онбординг' },
    },
    {
        key: 'onboarding.firstProject.legacy',
        path: '/onboarding/first-project',
        component: lazy(() => import('@/views/onboarding/RedirectToOnboarding')),
        authority: [],
        meta: { pageTitle: 'Онбординг' },
    },
    {
        key: 'onboarding.inviteTeam.legacy',
        path: '/onboarding/invite-team',
        component: lazy(() => import('@/views/onboarding/RedirectToOnboarding')),
        authority: [],
        meta: { pageTitle: 'Онбординг' },
    },
    {
        key: 'onboarding.projectModel.legacy',
        path: '/onboarding/project-model',
        component: lazy(() => import('@/views/onboarding/RedirectToOnboarding')),
        authority: [],
        meta: { pageTitle: 'Онбординг' },
    },
    {
        key: 'onboarding.projectEntry.legacy',
        path: '/onboarding/project-entry',
        component: lazy(() => import('@/views/onboarding/RedirectToOnboarding')),
        authority: [],
        meta: { pageTitle: 'Онбординг' },
    },
    {
        key: 'onboarding',
        path: '/onboarding',
        component: lazy(() => import('@/views/onboarding/ProjectEntryChoice')),
        authority: [],
        meta: {
            pageContainerType: 'contained',
            pageTitle: 'Добро пожаловать',
            header: {},
        },
    },
    // SCR-BOX-ORG-RECOVERY (BX-ONB-2) — box-восстановление единственной
    // организации для вошедшего пользователя без орг (bootstrap создал админа,
    // CreateOrganization упал). Запрет второй орг: если орг уже есть → в приложение.
    {
        key: 'onboarding.organization',
        path: '/onboarding/organization',
        component: lazy(() => import('@/views/onboarding/OrgSetupRecovery')),
        authority: [],
        meta: {
            layout: 'blank',
            pageTitle: 'Создание организации',
        },
    },
    // SCR-BOX-BOOTSTRAP-SUCCESS (BX-ONB-4) — мост Bootstrap → мастер первого
    // проекта: подтверждение «Организация «X» создана» + прогресс этап 1→2,
    // затем детерминированно в мастер. Blank-layout (ещё нет активного проекта).
    {
        key: 'onboarding.welcome',
        path: '/onboarding/welcome',
        component: lazy(() => import('@/views/onboarding/BootstrapSuccess')),
        authority: [],
        meta: {
            layout: 'blank',
            pageTitle: 'Организация создана',
        },
    },
    // SCR-ONB-NO-PROJECTS (FR-ONB-13) — informative dead-end stub for an
    // employee without project rights. minimalChrome (no active project).
    {
        key: 'onboarding.noProjects',
        path: '/onboarding/no-projects',
        component: lazy(() => import('@/views/onboarding/NoProjects')),
        authority: [],
        meta: {
            pageContainerType: 'contained',
            pageTitle: 'Нет проектов',
            header: {},
        },
    },
    {
        key: 'onboarding.createProject',
        path: '/onboarding/create-project',
        component: lazy(
            () => import('@/views/onboarding/RedirectToAccountCreateProject'),
        ),
        authority: [],
        meta: {
            pageTitle: 'Новый проект',
        },
    },
    // Центр поддержки
    {
        key: 'help',
        path: '/help',
        component: lazy(() => import('@/views/help/SupportHub')),
        authority: [],
        meta: { pageTitle: 'Центр поддержки' },
    },
    // Центр поддержки — статья
    {
        key: 'help.article',
        path: '/help/article/:slug',
        component: lazy(() => import('@/views/help/ArticleView')),
        authority: [],
        meta: { pageTitle: 'Центр поддержки' },
    },
    // Правила использования
    {
        key: 'terms',
        path: '/terms',
        component: lazy(() => import('@/views/help/TermsOfUse')),
        authority: [],
        meta: { pageTitle: 'Правила использования' },
    },
    // Account - Profile
    {
        key: 'account.profile',
        path: '/account/profile',
        component: lazy(() => import('@/views/account/Profile')),
        authority: [],
        meta: { pageTitle: 'Профиль' },
    },
    // SCR-MPROF-EMAIL-CHANGE — смена email (re-auth)
    {
        key: 'account.profile.changeEmail',
        path: '/account/profile/change-email',
        component: lazy(() => import('@/views/account/Profile/EmailChange')),
        authority: [],
        meta: { pageTitle: 'Смена email' },
    },
    // SCR-MPROF-MY-ACCESS — my projects / roles / visibility (FR-PROFILE-280)
    {
        key: 'account.access',
        path: '/account/access',
        component: lazy(() => import('@/views/account/Profile/MyAccess')),
        authority: [],
        meta: { pageTitle: 'Мои доступы' },
    },
    // SCR-MPROF-USER-VIEW — colleague profile (FR-PROFILE-320)
    {
        key: 'account.users.view',
        path: '/account/users/:id',
        component: lazy(() => import('@/views/account/Profile/UserProfileView')),
        authority: [],
        meta: { pageTitle: 'Профиль пользователя' },
    },
    // Account - Projects (личные проекты)
    {
        key: 'account.projects',
        path: '/account/projects',
        component: lazy(() => import('@/views/account/AccountProjectsIndex')),
        authority: [],
        meta: { pageTitle: 'Проекты' },
    },
    {
        key: 'account.projects.members',
        path: '/account/projects/members',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Участники' },
    },
    {
        key: 'account.projects.roles',
        path: '/account/projects/roles',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Роли' },
    },
    // SCR-ONB-TEAM-STATUS (FR-ONB-21) — team onboarding status for a manager.
    // Lives in project settings (project.settings.tab, M-2); self-gated by
    // `project:manage` (no-permission stub for members, ST-10).
    {
        key: 'account.projects.teamStatus',
        path: '/account/projects/team-status',
        component: lazy(() => import('@/views/onboarding/TeamStatus')),
        authority: [],
        meta: { pageTitle: 'Статус команды' },
    },
    {
        key: 'account.projects.audit',
        path: '/account/projects/audit',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Журнал аудита' },
    },
    {
        key: 'account.projects.pipelines',
        path: '/account/projects/pipelines',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Воронки' },
    },
    {
        key: 'account.projects.modules',
        path: '/account/projects/modules',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Модули' },
    },
    {
        key: 'account.projects.settings.modules',
        path: '/account/projects/settings/modules',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Модули проекта' },
    },
    {
        key: 'account.projects.settings.policies',
        path: '/account/projects/settings/policies',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Политики доступа' },
    },
    {
        key: 'account.projects.settings',
        path: '/account/projects/settings',
        component: lazy(() => import('@/views/account/AccountProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Настройки' },
    },
    {
        key: 'account.projects.new',
        path: '/account/projects/new',
        component: lazy(() => import('@/views/account/AccountCreateProject')),
        authority: [],
        meta: { pageTitle: 'Новый проект' },
    },
    // Настройки конкретного проекта (в layout аккаунта: сайдбар Профиль/Проекты/... слева, настройки справа)
    {
        key: 'account.projects.project.settings.modules',
        path: '/account/projects/:projectId/settings/modules',
        component: lazy(() => import('@/views/account/AccountProjectSettings')),
        authority: [],
        meta: { pageTitle: 'Модули проекта' },
    },
    {
        key: 'account.projects.project.settings.policies',
        path: '/account/projects/:projectId/settings/policies',
        component: lazy(() => import('@/views/account/AccountProjectSettings')),
        authority: [],
        meta: { pageTitle: 'Политики доступа' },
    },
    {
        key: 'account.projects.project.settings',
        path: '/account/projects/:projectId/settings',
        component: lazy(() => import('@/views/account/AccountProjectSettings')),
        authority: [],
        meta: { pageTitle: 'Настройки проекта' },
    },
    // Account - Security
    {
        key: 'account.security',
        path: '/account/security',
        component: lazy(() => import('@/views/account/Security')),
        authority: [],
        meta: { pageTitle: 'Безопасность' },
    },
    {
        key: 'account.security.sessions',
        path: '/account/security/sessions',
        component: lazy(() => import('@/views/account/Security/Sessions')),
        authority: [],
        meta: { pageTitle: 'Сессии' },
    },
    // SCR-MPROF-2FA-SETUP — мастер включения 2FA
    {
        key: 'account.security.2fa.setup',
        path: '/account/security/2fa/setup',
        component: lazy(() => import('@/views/account/Security/TwoFaSetup')),
        authority: [],
        meta: { pageTitle: 'Включение 2FA' },
    },
    // SCR-MPROF-2FA-BACKUP — резервные коды 2FA
    {
        key: 'account.security.2fa.backupCodes',
        path: '/account/security/2fa/backup-codes',
        component: lazy(() => import('@/views/account/Security/TwoFaBackup')),
        authority: [],
        meta: { pageTitle: 'Резервные коды' },
    },
    // Account - Notifications
    {
        key: 'account.notifications.settings',
        path: '/account/notifications/settings',
        component: lazy(() => import('@/views/account/Notifications/NotificationSettings')),
        authority: [],
        meta: { pageTitle: 'Настройки уведомлений', requires: 'notifications:read' },
    },
    {
        key: 'account.notifications',
        path: '/account/notifications',
        component: lazy(() => import('@/views/account/Notifications/NotificationsList')),
        authority: [],
        meta: { pageTitle: 'Уведомления', requires: 'notifications:read' },
    },
    // Настройки Системы (box single-tenant: одна Система, без orgId в URL — плоский /settings/*)
    {
        key: 'account.system',
        path: '/settings',
        component: lazy(() => import('@/views/account/System/SystemProfile')),
        authority: [],
        meta: { pageTitle: 'Реквизиты' },
    },
    {
        key: 'account.system.departments',
        path: '/settings/departments',
        component: lazy(() => import('@/views/account/System/Departments')),
        authority: [],
        meta: { pageTitle: 'Подразделения' },
    },
    {
        key: 'account.system.colleagues',
        path: '/settings/colleagues',
        component: lazy(() => import('@/views/account/System/Directory')),
        authority: [],
        meta: { pageTitle: 'Коллеги' },
    },
    {
        key: 'account.system.employees',
        path: '/settings/employees',
        component: lazy(() => import('@/views/account/System/Employees')),
        authority: [],
        meta: { pageTitle: 'Сотрудники' },
    },
    {
        key: 'account.system.audit',
        path: '/settings/audit',
        component: lazy(() => import('@/views/account/System/SystemAudit')),
        authority: [],
        meta: { pageTitle: 'Журнал аудита' },
    },
    {
        key: 'account.system.oidc',
        path: '/settings/sso',
        component: lazy(() => import('@/views/account/System/OidcProviders')),
        authority: [],
        meta: { pageTitle: 'Внешний SSO (OIDC)' },
    },
    {
        key: 'account.system.serviceKeys',
        path: '/settings/service-api-keys',
        component: lazy(() => import('@/views/account/System/ServiceApiKeys')),
        authority: [],
        meta: { pageTitle: 'Service API keys' },
    },
    // TODO-026 / TODO-104 (box): маршрут `/settings/overview` (SCR-MORG-REGION-OVERVIEW,
    // кросс-проектный org-overview) удалён вместе с контуром — в коробке нет
    // сущности «Организация», gateway не регистрирует /v1/system/overview/* (DEORG),
    // роллап org-overview никто не писал → экран вёл на мёртвые запросы.
    // Проекты Системы: специфичные :projectId/settings РАНЬШE плоских /projects/*.
    {
        key: 'account.system.projects.project.settings.modules',
        path: '/settings/projects/:projectId/settings/modules',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Модули проекта' },
    },
    {
        key: 'account.system.projects.project.settings.policies',
        path: '/settings/projects/:projectId/settings/policies',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Политики доступа' },
    },
    {
        key: 'account.system.projects.project.settings',
        path: '/settings/projects/:projectId/settings',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Настройки проекта' },
    },
    {
        key: 'account.system.projects.members',
        path: '/settings/projects/members',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Участники' },
    },
    {
        key: 'account.system.projects.roles',
        path: '/settings/projects/roles',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Роли' },
    },
    {
        key: 'account.system.projects.audit',
        path: '/settings/projects/audit',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Журнал аудита' },
    },
    {
        key: 'account.system.projects.pipelines',
        path: '/settings/projects/pipelines',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Воронки' },
    },
    {
        key: 'account.system.projects.modules',
        path: '/settings/projects/modules',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Модули' },
    },
    {
        key: 'account.system.projects.settings.modules',
        path: '/settings/projects/settings/modules',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Модули проекта' },
    },
    {
        key: 'account.system.projects.settings.policies',
        path: '/settings/projects/settings/policies',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Политики доступа' },
    },
    {
        key: 'account.system.projects.settings',
        path: '/settings/projects/settings',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Настройки' },
    },
    {
        key: 'account.system.projects',
        path: '/settings/projects',
        component: lazy(() => import('@/views/account/SettingsProjectsOrphanRedirect')),
        authority: [],
        meta: { pageTitle: 'Проекты' },
    },
    // ── Портфель (контекст проекта из store/localStorage, без /p в URL) ──────────────────────────
    {
        key: 'portfolio.statistics',
        path: '/statistics',
        component: lazy(lazyRemote('statistics')),
        authority: [],
        meta: { pageTitle: 'Статистика' },
    },
    {
        // Дашборд — системный host-экран (RFC-3 §1.4): каркас host + слот
        // `dashboard.widget` (врезки модулей, R4-E1-09) + экран статистики.
        key: 'portfolio.dashboard',
        path: '/dashboard',
        component: lazy(() => import('@/views/crm/Dashboard/DashboardHost')),
        authority: [],
        meta: { pageTitle: 'Дашборд' },
    },
    // ── Портфель: Контакты ────────────────────────
    {
        key: 'portfolio.contacts',
        path: '/contacts',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Контакты' },
    },
    {
        key: 'portfolio.contacts.details',
        path: '/contacts/:id',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Карточка контакта' },
    },
    {
        key: 'portfolio.contacts.edit',
        path: '/contacts/:id/edit',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Редактирование контакта' },
    },
    {
        key: 'portfolio.contacts.import',
        path: '/contacts/import',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Импорт контактов' },
    },
    {
        key: 'portfolio.contacts.trash',
        path: '/contacts/trash',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Корзина контактов' },
    },
    {
        key: 'portfolio.contacts.duplicates',
        path: '/contacts/duplicates',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Очередь дублей' },
    },
    {
        key: 'portfolio.contacts.merge',
        path: '/contacts/merge',
        component: lazy(lazyRemote('contacts')),
        authority: [],
        meta: { pageTitle: 'Слияние контактов' },
    },
    // ── Портфель: Компании ────────────────────────
    {
        key: 'portfolio.companies',
        path: '/companies',
        component: lazy(lazyRemote('companies')),
        authority: [],
        meta: { pageTitle: 'Компании', requires: 'companies:read' },
    },
    {
        key: 'portfolio.companies.details',
        path: '/companies/:id',
        component: lazy(lazyRemote('companies')),
        authority: [],
        meta: { pageTitle: 'Карточка компании', requires: 'companies:read' },
    },
    {
        key: 'portfolio.companies.edit',
        path: '/companies/:id/edit',
        component: lazy(lazyRemote('companies')),
        authority: [],
        meta: { pageTitle: 'Редактирование компании', requires: 'companies:read' },
    },
    {
        key: 'portfolio.companies.import',
        path: '/companies/import',
        component: lazy(lazyRemote('companies')),
        authority: [],
        meta: { pageTitle: 'Импорт компаний', requires: 'companies:read' },
    },
    {
        key: 'portfolio.companies.trash',
        path: '/companies/trash',
        component: lazy(lazyRemote('companies')),
        authority: [],
        meta: { pageTitle: 'Корзина компаний', requires: 'companies:read' },
    },
    {
        key: 'portfolio.companies.merge',
        path: '/companies/merge',
        component: lazy(lazyRemote('companies')),
        authority: [],
        meta: { pageTitle: 'Объединение дублей', requires: 'companies:read' },
    },
    // ── Портфель: Поиск ───────────────────────────
    // Полноэкранный поиск (remote modules/search → SearchModule). Был модуль/манифест,
    // но без host-роута → /search давал 404.
    {
        key: 'portfolio.search',
        path: '/search',
        component: lazy(lazyRemote('search')),
        authority: [],
        meta: { pageTitle: 'Поиск' },
    },
    // ── Портфель: Уведомления ─────────────────────
    // Бэкенд отдаёт notifications как модуль (пункт меню /notifications), но remote-модуля
    // notifications нет → host-локальная страница, читает /api/v1/notification/list.
    {
        key: 'portfolio.notifications',
        path: '/notifications',
        component: lazy(() => import('@/views/notifications/NotificationsPage')),
        authority: [],
        meta: { pageTitle: 'Уведомления', requires: 'notifications:read' },
    },
    // ── Портфель: Чат ─────────────────────────────
    // Полноэкранный чат (remote modules/chat). Внутренний роутер ChatModule
    // разбирает :conversationId + query ?seq= (deep-link, 06-frontend-contract §2.2).
    {
        key: 'portfolio.chat',
        path: '/chat',
        component: lazy(lazyRemote('chat')),
        authority: [],
        meta: { pageTitle: 'Чат' },
    },
    {
        key: 'portfolio.chat.conversation',
        path: '/chat/:conversationId',
        component: lazy(lazyRemote('chat')),
        authority: [],
        meta: { pageTitle: 'Беседа' },
    },
    // ── Портфель: Сделки ──────────────────────────
    {
        key: 'portfolio.deals.list',
        path: '/deals',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Сделки' },
    },
    {
        key: 'portfolio.deals.kanban',
        path: '/deals/kanban',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Сделки (канбан)' },
    },
    {
        key: 'portfolio.deals.import',
        path: '/deals/import',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Импорт сделок' },
    },
    {
        key: 'portfolio.deals.details',
        path: '/deals/:id',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Карточка сделки' },
    },
    {
        key: 'portfolio.deals.edit',
        path: '/deals/:id/edit',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Редактирование сделки' },
    },
    {
        key: 'portfolio.deals.dashboard',
        path: '/deals/dashboard',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Дашборд сделок' },
    },
    {
        key: 'portfolio.deals.trash',
        path: '/deals/trash',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Корзина сделок' },
    },
    // ── Портфель: Продажи ──────────────────────────
    {
        key: 'portfolio.orders.list',
        path: '/orders',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Продажи' },
    },
    {
        key: 'portfolio.orders.kanban',
        path: '/orders/kanban',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Продажи (канбан)' },
    },
    {
        key: 'portfolio.orders.types',
        path: '/orders/types',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Типы продаж' },
    },
    {
        key: 'portfolio.orders.types.new',
        path: '/orders/types/new',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Новый тип продаж' },
    },
    {
        key: 'portfolio.orders.types.edit',
        path: '/orders/types/:id/edit',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Редактирование типа продаж' },
    },
    {
        key: 'portfolio.orders.details',
        path: '/orders/:id',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Карточка продажи' },
    },
    {
        key: 'portfolio.orders.edit',
        path: '/orders/:id/edit',
        component: lazy(lazyRemote('orders')),
        authority: [],
        meta: { pageTitle: 'Редактирование продажи' },
    },
    // ── Портфель: Активности ──────────────────────
    {
        key: 'portfolio.activities',
        path: '/activities/*',
        component: lazy(lazyRemote('activities')),
        authority: [],
        meta: { pageTitle: 'Активности', requires: 'activities:read' },
    },
    {
        key: 'portfolio.products',
        path: '/products',
        component: lazy(lazyRemote('products')),
        authority: [],
        meta: { pageTitle: 'Продукты' },
    },
    {
        key: 'portfolio.products.pricing',
        path: '/products/pricing',
        component: lazy(lazyRemote('products')),
        authority: [],
        meta: { pageTitle: 'Ценообразование' },
    },
    {
        key: 'portfolio.products.details',
        path: '/products/:id',
        component: lazy(lazyRemote('products')),
        authority: [],
        meta: { pageTitle: 'Карточка продукта' },
    },
    {
        key: 'portfolio.products.edit',
        path: '/products/:id/edit',
        component: lazy(lazyRemote('products')),
        authority: [],
        meta: { pageTitle: 'Редактирование продукта' },
    },
    // ── Портфель: Отчёты ──────────────────────────
    {
        key: 'portfolio.reports',
        path: '/reports',
        component: lazy(lazyRemote('reports')),
        authority: [],
        meta: { pageTitle: 'Отчёты', requires: 'reports:read' },
    },
    {
        key: 'portfolio.reports.builder',
        path: '/reports/builder',
        component: lazy(lazyRemote('reports')),
        authority: [],
        meta: {
            pageTitle: 'Конструктор отчётов',
            requires: 'reports:manage',
        },
    },
    // ── Портфель: Документы ───────────────────────
    {
        key: 'portfolio.documents',
        path: '/documents',
        component: lazy(lazyRemote('documents')),
        authority: [],
        meta: { pageTitle: 'Документы' },
    },
    {
        key: 'portfolio.documents.templates',
        path: '/documents/templates',
        component: lazy(lazyRemote('documents')),
        authority: [],
        meta: { pageTitle: 'Шаблоны документов' },
    },
    {
        key: 'portfolio.documents.templates.new',
        path: '/documents/templates/new',
        component: lazy(lazyRemote('documents')),
        authority: [],
        meta: { pageTitle: 'Новый шаблон' },
    },
    {
        key: 'portfolio.documents.templates.edit',
        path: '/documents/templates/:id/edit',
        component: lazy(lazyRemote('documents')),
        authority: [],
        meta: { pageTitle: 'Редактирование шаблона' },
    },
    {
        key: 'portfolio.documents.department',
        path: '/documents/department',
        component: lazy(lazyRemote('documents')),
        authority: [],
        meta: { pageTitle: 'Документы отдела' },
    },
    {
        key: 'portfolio.documents.details',
        path: '/documents/:id',
        component: lazy(lazyRemote('documents')),
        authority: [],
        meta: { pageTitle: 'Карточка документа' },
    },
    // ── Портфель: Автоматизация ───────────────────
    // automation-v2 (канва) — ПЕРЕД общими /automation/*, чтобы матчиться раньше
    // (порядок в массиве = приоритет; иначе /automation/v2 поймает /automation/:id/edit).
    {
        key: 'portfolio.automation.v2',
        path: '/automation/v2',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Автоматизация v2' },
    },
    {
        key: 'portfolio.automation.v2.new',
        path: '/automation/v2/new',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Новый сценарий' },
    },
    {
        key: 'portfolio.automation.v2.edit',
        path: '/automation/v2/:id',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Редактор сценария' },
    },
    {
        key: 'portfolio.automation',
        path: '/automation',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Автоматизация' },
    },
    {
        key: 'portfolio.automation.new',
        path: '/automation/new',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Новое правило автоматизации' },
    },
    {
        key: 'portfolio.automation.edit',
        path: '/automation/:id/edit',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Редактирование автоматизации' },
    },
    {
        key: 'portfolio.automation.connections',
        path: '/automation/connections',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Connections автоматизации' },
    },
    {
        key: 'portfolio.automation.connections.new',
        path: '/automation/connections/new',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Новый connection' },
    },
    {
        key: 'portfolio.automation.connections.edit',
        path: '/automation/connections/:id/edit',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Редактирование connection' },
    },
    {
        key: 'portfolio.automation.dlq',
        path: '/automation/dlq',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Приостановленные действия' },
    },
    {
        key: 'portfolio.automation.problems',
        path: '/automation/problems',
        component: lazy(lazyRemote('automation')),
        authority: [],
        meta: { pageTitle: 'Проблемы автоматизации' },
    },
    // ── Портфель: Воронки ─────────────────────────
    {
        key: 'portfolio.pipelines.list',
        path: '/deals/pipelines',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Воронки сделок' },
    },
    {
        key: 'portfolio.pipelines.new',
        path: '/deals/pipelines/new',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Новая воронка' },
    },
    {
        key: 'portfolio.pipelines.edit',
        path: '/deals/pipelines/:id/edit',
        component: lazy(lazyRemote('deals')),
        authority: [],
        meta: { pageTitle: 'Редактирование воронки' },
    },
    // ── Проект: Участники ─────────────────────────
    {
        key: 'project.members',
        path: '/members',
        component: lazy(() => import('@/views/crm/Members/ProjectMembers')),
        authority: [],
        meta: { pageTitle: 'Участники проекта' },
    },
    {
        key: 'project.members.invite',
        path: '/members/invite',
        component: lazy(() => import('@/views/crm/Members/InviteMember')),
        authority: [],
        meta: { pageTitle: 'Пригласить участника' },
    },
    // ── Проект: Журнал аудита ─────────────────────
    {
        key: 'project.audit',
        path: '/audit',
        component: lazy(() => import('@/views/crm/Audit')),
        authority: [],
        meta: { pageTitle: 'Журнал аудита' },
    },
    // ── Проект: top-level deep-link `/p/:pid` ─────────────────────────
    // Прямой URL/закладка `/p/:pid` раньше падал в catch-all → 404. Резолвим
    // проект по :pid (ставим контекст в projectStore) и редиректим в рабочее
    // пространство — первый доступный модуль (как ветка `project` в Home).
    // Sub-роуты `/p/:pid/settings` ниже более специфичны → матчатся раньше.
    {
        key: 'project.home',
        path: `${P_SETTINGS}`,
        component: lazy(() => import('@/views/ProjectHomeRedirect')),
        authority: [],
        meta: { pageTitle: 'Проект' },
    },
    // ── Проект: Настройки (редирект в layout аккаунта) ─────────────────
    {
        key: 'project.settings',
        path: `${P_SETTINGS}/settings`,
        component: lazy(() => import('@/views/account/RedirectToAccountProjectSettings')),
        authority: [],
        meta: { pageTitle: 'Настройки проекта' },
    },
    {
        key: 'project.settings.modules',
        path: `${P_SETTINGS}/settings/modules`,
        component: lazy(() => import('@/views/account/RedirectToAccountProjectSettings')),
        authority: [],
        meta: { pageTitle: 'Модули проекта' },
    },
    {
        key: 'project.settings.policies',
        path: `${P_SETTINGS}/settings/policies`,
        component: lazy(() => import('@/views/account/RedirectToAccountProjectSettings')),
        authority: [],
        meta: { pageTitle: 'Политики доступа' },
    },
    ...othersRoute,
]
