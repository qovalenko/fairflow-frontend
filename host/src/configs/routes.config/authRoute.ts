import { lazy } from 'react'
import type { Routes } from '@/@types/routes'

const authRoute: Routes = [
    {
        key: 'signIn',
        path: '/auth/signin',
        component: lazy(() => import('@/views/auth/SignIn')),
        authority: [],
        meta: { pageTitle: 'Вход' },
    },
    // SCR-BOX-BOOTSTRAP — create-first-admin коробки (documents/box §5.4 / §7
    // шаг 17). Публичный экран (до логина); включается PublicConfigGate по
    // `needsBootstrap:true`. В `authRoute` — чтобы получить auth-chrome
    // (AuthLayout side-branding) через PreLoginLayout.
    {
        key: 'bootstrap',
        path: '/bootstrap',
        component: lazy(() => import('@/views/auth/Bootstrap')),
        authority: [],
        meta: { pageTitle: 'Первичная настройка' },
    },
    // Box (on-prem, single-tenant): самостоятельная SaaS-регистрация закрыта —
    // учётные записи создаются только по приглашению, первый вход = bootstrap.
    // Маршрутов /auth/signup и /auth/signup/organization в коробке нет.
    {
        key: 'forgotPassword',
        path: '/auth/forgot-password',
        component: lazy(() => import('@/views/auth/ForgotPassword')),
        authority: [],
        meta: { pageTitle: 'Восстановление пароля' },
    },
    {
        key: 'resetPassword',
        path: '/auth/reset-password/:token',
        component: lazy(() => import('@/views/auth/ResetPassword')),
        authority: [],
        meta: { pageTitle: 'Сброс пароля' },
    },
    // SCR-AUTH-OAUTH-CALLBACK — handoff после OAuth/OIDC: gateway редиректит сюда
    // с токеном во фрагменте URL; страница завершает вход через completeOAuthSignIn.
    {
        key: 'oauthCallback',
        path: '/auth/oauth/callback',
        component: lazy(() => import('@/views/auth/OauthCallback')),
        authority: [],
        meta: { pageTitle: 'Внешний вход' },
    },
]

export default authRoute
